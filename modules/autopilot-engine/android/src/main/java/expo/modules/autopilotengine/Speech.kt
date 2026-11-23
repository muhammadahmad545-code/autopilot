package expo.modules.autopilotengine

import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID

/**
 * "Say something out loud" action. The text-to-speech engine starts asynchronously, so lines
 * queued before it is ready are spoken once it is, and the engine shuts down when it falls quiet.
 */
object Speech {
  private var tts: TextToSpeech? = null
  private var ready = false
  private val queue = mutableListOf<String>()
  private val main = Handler(Looper.getMainLooper())
  private val idleShutdown = Runnable { shutdown() }

  fun say(context: Context, text: String): String? {
    val line = text.trim()
    if (line.isEmpty()) return "Nothing to say"
    main.post { speakOnMain(context.applicationContext, line.take(400)) }
    return null
  }

  @Synchronized
  private fun speakOnMain(context: Context, line: String) {
    main.removeCallbacks(idleShutdown)
    val engine = tts
    if (engine != null && ready) {
      speak(engine, line)
      return
    }
    queue.add(line)
    if (engine != null) return
    tts = TextToSpeech(context) { status ->
      synchronized(this) {
        val current = tts ?: return@synchronized
        if (status != TextToSpeech.SUCCESS) {
          queue.clear()
          shutdown()
          return@synchronized
        }
        ready = true
        current.setAudioAttributes(
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        )
        current.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String?) {}
          override fun onDone(id: String?) { main.postDelayed(idleShutdown, 15_000) }
          @Deprecated("Deprecated in Java")
          override fun onError(id: String?) { main.postDelayed(idleShutdown, 15_000) }
        })
        queue.forEach { speak(current, it) }
        queue.clear()
      }
    }
  }

  private fun speak(engine: TextToSpeech, line: String) {
    engine.speak(line, TextToSpeech.QUEUE_ADD, null, UUID.randomUUID().toString())
  }

  @Synchronized
  private fun shutdown() {
    runCatching { tts?.shutdown() }
    tts = null
    ready = false
  }
}
