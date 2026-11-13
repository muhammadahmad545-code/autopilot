package expo.modules.autopilotengine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Foreground service that listens for system changes Android no longer delivers to apps in the
 * background: charger, battery level, unlock, audio devices and Wi-Fi. It only runs while an
 * enabled rule needs one of these triggers.
 */
class WatchService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastBattery = -1
  private var headphonesConnected = false
  private var audioCallback: AudioDeviceCallback? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null
  private var receiversRegistered = false

  // Wi-Fi state: the network we consider "connected", its name, and a pending debounced disconnect.
  private var wifiNetwork: Network? = null
  private var wifiSsid: String? = null
  private var wifiAnnounced = false
  private var pendingDisconnect: Runnable? = null
  private var pendingConnect: Runnable? = null

  private val systemReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_POWER_CONNECTED -> emit(JSONObject().put("type", "charging").put("state", "connected").put("description", "Charger connected"))
        Intent.ACTION_POWER_DISCONNECTED -> emit(JSONObject().put("type", "charging").put("state", "disconnected").put("description", "Charger disconnected"))
        Intent.ACTION_USER_PRESENT -> emit(JSONObject().put("type", "unlock").put("description", "Phone unlocked"))
        Intent.ACTION_BATTERY_CHANGED -> {
          val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
          if (level < 0 || scale <= 0) return
          val percent = level * 100 / scale
          if (percent != lastBattery) {
            lastBattery = percent
            emit(JSONObject().put("type", "battery").put("level", percent).put("description", "Battery at $percent%"))
          }
        }
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (!goForeground()) {
      stopSelf()
      return
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_POWER_DISCONNECTED)
      addAction(Intent.ACTION_BATTERY_CHANGED)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    ContextCompat.registerReceiver(this, systemReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    receiversRegistered = true
    runCatching { watchHeadphones() }
    runCatching { watchWifi() }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground must always run first, even when we are about to stop, or Android crashes the app.
    if (!goForeground()) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    if (receiversRegistered) runCatching { unregisterReceiver(systemReceiver) }
    audioCallback?.let { cb -> runCatching { getSystemService(AudioManager::class.java).unregisterAudioDeviceCallback(cb) } }
    networkCallback?.let { cb -> runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(cb) } }
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  private fun emit(event: JSONObject) {
    try {
      Engine.onEvent(applicationContext, event)
    } catch (e: Exception) {
      // A broken rule must never take the watcher down.
    }
  }

  // ---- audio devices ----------------------------------------------------------------------------

  private fun isPersonalAudio(device: AudioDeviceInfo): Boolean {
    val types = mutableSetOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_USB_HEADSET
    )
    if (Build.VERSION.SDK_INT >= 31) types.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
    return device.type in types
  }

  private fun watchHeadphones() {
    val audio = getSystemService(AudioManager::class.java)
    headphonesConnected = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any(::isPersonalAudio)
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = check()
      override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = check()
      private fun check() {
        val devices = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter(::isPersonalAudio)
        val now = devices.isNotEmpty()
        if (now == headphonesConnected) return
        headphonesConnected = now
        val name = devices.firstOrNull()?.productName?.toString()?.takeIf { it.isNotBlank() }
        emit(JSONObject().put("type", "headphones").put("state", if (now) "connected" else "disconnected")
          .put("description", if (now) "Audio device connected${name?.let { ": $it" } ?: ""}" else "Audio device disconnected"))
      }
    }
    audio.registerAudioDeviceCallback(callback, handler)
    audioCallback = callback
  }

  // ---- Wi-Fi ------------------------------------------------------------------------------------

  @Suppress("DEPRECATION")
  private fun legacySsid(): String? = clean(getSystemService(WifiManager::class.java)?.connectionInfo?.ssid)

  private fun clean(raw: String?): String? {
    val ssid = raw?.trim('"') ?: return null
    return if (ssid.isEmpty() || ssid == WifiManager.UNKNOWN_SSID || ssid == "<unknown ssid>") null else ssid
  }

  private fun announceConnected() {
    if (wifiAnnounced) return
    wifiAnnounced = true
    val ssid = wifiSsid
    emit(JSONObject().put("type", "wifi").put("state", "connected").put("ssid", ssid ?: "")
      .put("description", if (ssid != null) "Connected to $ssid" else "Connected to Wi-Fi"))
  }

  private fun watchWifi() {
    val connectivity = getSystemService(ConnectivityManager::class.java)
    // Seed the current state so starting the service does not fire "connected".
    connectivity.activeNetwork?.let { active ->
      val caps = connectivity.getNetworkCapabilities(active)
      if (caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
        wifiNetwork = active
        wifiSsid = (if (Build.VERSION.SDK_INT >= 31) clean((caps.transportInfo as? WifiInfo)?.ssid) else null) ?: legacySsid()
        wifiAnnounced = true
      }
    }

    val callback = object : ConnectivityManager.NetworkCallback(if (Build.VERSION.SDK_INT >= 31) FLAG_INCLUDE_LOCATION_INFO else 0) {
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
        handler.post {
          val ssid = (if (Build.VERSION.SDK_INT >= 31) clean((caps.transportInfo as? WifiInfo)?.ssid) else null) ?: legacySsid()
          val reconnectSame = pendingDisconnect != null && (ssid == null || ssid == wifiSsid)
          pendingDisconnect?.let { handler.removeCallbacks(it) }
          pendingDisconnect = null
          if (reconnectSame && wifiAnnounced) {
            // A brief drop and back on the same network: not a real disconnect.
            wifiNetwork = network
            return@post
          }
          if (wifiNetwork != network || !wifiAnnounced) {
            if (wifiAnnounced && wifiNetwork != null && ssid != null && ssid != wifiSsid) {
              emit(JSONObject().put("type", "wifi").put("state", "disconnected").put("ssid", wifiSsid ?: "").put("description", "Left ${wifiSsid ?: "Wi-Fi"}"))
            }
            if (wifiNetwork != network) wifiAnnounced = false
            wifiNetwork = network
            if (ssid != null) wifiSsid = ssid
            // Wait briefly for the name to become readable, then announce once.
            pendingConnect?.let { handler.removeCallbacks(it) }
            val run = Runnable { announceConnected() }
            pendingConnect = run
            handler.postDelayed(run, if (ssid != null) 0 else 2000)
          } else if (ssid != null) {
            wifiSsid = ssid
          }
        }
      }

      override fun onLost(network: Network) {
        handler.post {
          if (network != wifiNetwork) return@post
          pendingConnect?.let { handler.removeCallbacks(it) }
          pendingConnect = null
          if (!wifiAnnounced) {
            wifiNetwork = null
            return@post
          }
          // Debounce: weak signal and power saving cause short drops that are not "leaving".
          val previous = wifiSsid
          val run = Runnable {
            pendingDisconnect = null
            wifiNetwork = null
            wifiAnnounced = false
            wifiSsid = null
            emit(JSONObject().put("type", "wifi").put("state", "disconnected").put("ssid", previous ?: "")
              .put("description", if (previous != null) "Left $previous" else "Wi-Fi disconnected"))
          }
          pendingDisconnect = run
          handler.postDelayed(run, DISCONNECT_DEBOUNCE_MS)
        }
      }
    }
    connectivity.registerNetworkCallback(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), callback)
    networkCallback = callback
  }

  // ---- foreground notification -------------------------------------------------------------------

  /** Returns false when Android refuses the foreground start (e.g. a background restart on Android 12+). */
  private fun goForeground(): Boolean {
    return try {
      val nm = getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Watching triggers", NotificationManager.IMPORTANCE_MIN).apply {
          description = "Shown while Autopilot listens for charger, battery, unlock, audio and Wi-Fi changes"
          setShowBadge(false)
        })
      }
      val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
        PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
      }
      val count = Engine.rules(this).count { it.enabled && it.triggerType in EVENT_TYPES }
      val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_autopilot_stat)
        .setContentTitle("Autopilot is on")
        .setContentText("Watching $count rule${if (count == 1) "" else "s"}")
        .setOngoing(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .apply { if (launch != null) setContentIntent(launch) }
        .build()
      if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(NOTIFICATION_ID, notification)
      true
    } catch (e: Exception) {
      false
    }
  }

  companion object {
    val EVENT_TYPES = setOf("charging", "battery", "headphones", "wifi", "unlock")
    private const val CHANNEL = "autopilot_watch"
    private const val NOTIFICATION_ID = 4202
    private const val ACTION_STOP = "expo.modules.autopilotengine.STOP"
    private const val DISCONNECT_DEBOUNCE_MS = 45_000L

    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, WatchService::class.java))
      } catch (e: Exception) {
        // Android 12+ refuses background starts in some states; the next app open or boot retries.
      }
    }

    /** Stop through the service itself, so startForeground always runs before it ends. */
    fun stop(context: Context) {
      try {
        context.startService(Intent(context, WatchService::class.java).setAction(ACTION_STOP))
      } catch (e: Exception) {
        context.stopService(Intent(context, WatchService::class.java))
      }
    }
  }
}
