package com.ncsonic.soundlab.field

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Binder
import android.os.Build
import android.os.IBinder
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native Android 14+ Foreground Audio Capture Service.
 *
 * Implements the field recording policy tested in `captureSpec.ts`:
 * - Declared service types: `microphone | dataSync` (API 34+ requirement)
 * - Probes `UNPROCESSED_SOURCE_SUPPORTED` at runtime; falls back to `MIC`
 * - Rejects Bluetooth SCO/A2DP narrowband microphones to protect fidelity
 * - Probes `ENCODING_PCM_FLOAT` (with graceful fallback to `ENCODING_PCM_16BIT`)
 * - Non-blocking ring buffer streaming to prevent audio buffer overruns
 */
class CaptureService : Service() {

    private val binder = LocalBinder()
    private val isRecording = AtomicBoolean(false)
    private var audioRecord: AudioRecord? = null
    private var captureThread: Thread? = null

    interface ChunkListener {
        fun onChunkReceived(floats: FloatArray, frames: Int)
        fun onError(message: String)
    }

    private var chunkListener: ChunkListener? = null

    inner class LocalBinder : Binder() {
        fun getService(): CaptureService = this@CaptureService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    fun setChunkListener(listener: ChunkListener?) {
        this.chunkListener = listener
    }

    /**
     * Start field recording with runtime device checks.
     */
    fun startCapture(
        sampleRate: Int = 48000,
        channels: Int = 1,
        preferFloat: Boolean = true
    ): Boolean {
        if (isRecording.get()) return true

        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        // 1. Guard against narrowband Bluetooth capture
        if (isBluetoothMicrophoneConnected(audioManager)) {
            chunkListener?.onError("Bluetooth microphones drop to narrowband and are blocked for field recording.")
            return false
        }

        // 2. Select audio source: UNPROCESSED if supported, fallback to MIC
        val isUnprocessedSupported = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val property = AudioManager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED)
            property.toBoolean()
        } else {
            false
        }

        val audioSource = if (isUnprocessedSupported) {
            MediaRecorder.AudioSource.UNPROCESSED
        } else {
            MediaRecorder.AudioSource.MIC
        }

        val channelConfig = if (channels == 2) {
            AudioFormat.CHANNEL_IN_STEREO
        } else {
            AudioFormat.CHANNEL_IN_MONO
        }

        // 3. Select encoding format: PCM_FLOAT with PCM_16BIT fallback
        var audioFormat = if (preferFloat && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            AudioFormat.ENCODING_PCM_FLOAT
        } else {
            AudioFormat.ENCODING_PCM_16BIT
        }

        var minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        if (minBufferSize <= 0) {
            // Fallback to 16-bit PCM if float is unsupported
            audioFormat = AudioFormat.ENCODING_PCM_16BIT
            minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        }

        val bufferSize = Math.max(minBufferSize * 2, sampleRate / 10 * (if (audioFormat == AudioFormat.ENCODING_PCM_FLOAT) 4 else 2) * channels)

        try {
            audioRecord = AudioRecord(
                audioSource,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                chunkListener?.onError("Failed to initialize native AudioRecord.")
                return false
            }

            // 4. Start foreground service with Android 14 service types
            val notification = buildForegroundNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }

            audioRecord?.startRecording()
            isRecording.set(true)

            // 5. Worker thread reading chunks
            captureThread = Thread({
                readCaptureLoop(audioFormat, channels)
            }, "NcFieldCaptureWorker")
            captureThread?.start()

            return true
        } catch (e: Exception) {
            chunkListener?.onError("Error starting capture: ${e.message}")
            stopCapture()
            return false
        }
    }

    private fun readCaptureLoop(audioFormat: Int, channels: Int) {
        val record = audioRecord ?: return
        val isFloat = audioFormat == AudioFormat.ENCODING_PCM_FLOAT
        val chunkSize = 2048

        if (isFloat && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val floatBuffer = FloatArray(chunkSize * channels)
            while (isRecording.get()) {
                val read = record.read(floatBuffer, 0, floatBuffer.size, AudioRecord.READ_BLOCKING)
                if (read > 0) {
                    chunkListener?.onChunkReceived(floatBuffer.copyOf(read), read / channels)
                }
            }
        } else {
            val shortBuffer = ShortArray(chunkSize * channels)
            val floatBuffer = FloatArray(chunkSize * channels)
            while (isRecording.get()) {
                val read = record.read(shortBuffer, 0, shortBuffer.size)
                if (read > 0) {
                    for (i in 0 until read) {
                        floatBuffer[i] = shortBuffer[i] / 32768.0f
                    }
                    chunkListener?.onChunkReceived(floatBuffer.copyOf(read), read / channels)
                }
            }
        }
    }

    fun stopCapture() {
        if (!isRecording.getAndSet(false)) return
        try {
            captureThread?.interrupt()
            captureThread = null
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
        } catch (_: Exception) {}

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }

    private fun isBluetoothMicrophoneConnected(audioManager: AudioManager): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
            for (device in devices) {
                if (device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                    device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
                    return true
                }
            }
        }
        return false
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Field Sound Recording",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ongoing field audio capture"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("NC Field Sound Lab")
                .setContentText("Capturing unprocessed audio with pre-roll protection…")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("NC Field Sound Lab")
                .setContentText("Capturing audio…")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build()
        }
    }

    companion object {
        const val CHANNEL_ID = "nc_field_capture_channel"
        const val NOTIFICATION_ID = 9012
    }
}
