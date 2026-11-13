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
 * background: charger, battery level, headphones and Wi-Fi. It only runs while an enabled rule
 * needs one of these triggers.
 */
class WatchService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastBattery = -1
  private var headphonesConnected = false
  private var wifiSsid: String? = null
  private var wifiConnected = false
  private var audioCallback: AudioDeviceCallback? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  private val powerReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_POWER_CONNECTED -> emit(JSONObject().put("type", "charging").put("state", "connected").put("description", "Charger connected"))
        Intent.ACTION_POWER_DISCONNECTED -> emit(JSONObject().put("type", "charging").put("state", "disconnected").put("description", "Charger disconnected"))
        Intent.ACTION_BATTERY_CHANGED -> {
          val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
          if (level < 0 || scale <= 0) return
          val percent = level * 100 / scale
          if (lastBattery >= 0 && percent != lastBattery) {
            emit(JSONObject().put("type", "battery").put("level", percent).put("previous", lastBattery).put("description", "Battery at $percent%"))
          }
          lastBattery = percent
        }
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    goForeground()
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_POWER_DISCONNECTED)
      addAction(Intent.ACTION_BATTERY_CHANGED)
    }
    ContextCompat.registerReceiver(this, powerReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    watchHeadphones()
    watchWifi()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    goForeground()
    return START_STICKY
  }

  override fun onDestroy() {
    runCatching { unregisterReceiver(powerReceiver) }
    audioCallback?.let { cb -> runCatching { getSystemService(AudioManager::class.java).unregisterAudioDeviceCallback(cb) } }
    networkCallback?.let { cb -> runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(cb) } }
    super.onDestroy()
  }

  private fun emit(event: JSONObject) {
    try {
      Engine.onEvent(applicationContext, event)
    } catch (e: Exception) {
      // A broken rule must never take the watcher down.
    }
  }

  // ---- headphones ---------------------------------------------------------------------------------

  private fun isHeadphone(device: AudioDeviceInfo): Boolean {
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
    headphonesConnected = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any(::isHeadphone)
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = check()
      override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = check()
      private fun check() {
        val now = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any(::isHeadphone)
        if (now == headphonesConnected) return
        headphonesConnected = now
        emit(JSONObject().put("type", "headphones").put("state", if (now) "connected" else "disconnected")
          .put("description", if (now) "Headphones connected" else "Headphones disconnected"))
      }
    }
    audio.registerAudioDeviceCallback(callback, handler)
    audioCallback = callback
  }

  // ---- Wi-Fi ----------------------------------------------------------------------------------------

  @Suppress("DEPRECATION")
  private fun currentSsid(): String? {
    val info = getSystemService(WifiManager::class.java)?.connectionInfo ?: return null
    val ssid = info.ssid?.trim('"') ?: return null
    return if (ssid.isEmpty() || ssid == "<unknown ssid>") null else ssid
  }

  private fun watchWifi() {
    val connectivity = getSystemService(ConnectivityManager::class.java)
    val active = connectivity.activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
    wifiConnected = active?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    wifiSsid = if (wifiConnected) currentSsid() else null

    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        // Give the system a moment so the SSID is readable.
        handler.postDelayed({
          val ssid = currentSsid()
          if (wifiConnected && ssid == wifiSsid) return@postDelayed
          wifiConnected = true
          wifiSsid = ssid
          emit(JSONObject().put("type", "wifi").put("state", "connected").put("ssid", ssid ?: "")
            .put("description", if (ssid != null) "Connected to $ssid" else "Connected to Wi-Fi"))
        }, 1500)
      }

      override fun onLost(network: Network) {
        handler.post {
          if (!wifiConnected) return@post
          val previous = wifiSsid
          wifiConnected = false
          wifiSsid = null
          emit(JSONObject().put("type", "wifi").put("state", "disconnected").put("ssid", previous ?: "")
            .put("description", if (previous != null) "Left $previous" else "Wi-Fi disconnected"))
        }
      }
    }
    connectivity.registerNetworkCallback(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), callback)
    networkCallback = callback
  }

  // ---- foreground notification ---------------------------------------------------------------------

  private fun goForeground() {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Watching triggers", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Shown while Autopilot listens for charger, battery, headphone and Wi-Fi changes"
        setShowBadge(false)
      })
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val count = Engine.rules(this).count { it.enabled && it.triggerType in EVENT_TYPES }
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Autopilot is on")
      .setContentText("Watching $count rule${if (count == 1) "" else "s"}")
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .apply { if (launch != null) setContentIntent(launch) }
      .build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(NOTIFICATION_ID, notification)
  }

  companion object {
    val EVENT_TYPES = setOf("charging", "battery", "headphones", "wifi")
    private const val CHANNEL = "autopilot_watch"
    private const val NOTIFICATION_ID = 4202

    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, WatchService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, WatchService::class.java))
    }
  }
}
