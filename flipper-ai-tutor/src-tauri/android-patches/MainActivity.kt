package com.dolphin_gang_tour.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbManager
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import java.io.File

class MainActivity : TauriActivity() {
  private var usbReceiver: BroadcastReceiver? = null
  private var usbReceiverRegistered = false
  @Volatile private var usbBridgeRunning = false
  private var usbBridgeThread: Thread? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    registerUsbReceiver()
    FlipperUsbManager.refreshScanCache(this)
    startUsbBridge()
  }

  override fun onResume() {
    super.onResume()
    FlipperUsbManager.refreshScanCache(this)
    processPendingUsbConnect()
  }

  private fun processPendingUsbConnect() {
    val pending = File(filesDir, "pending_usb_connect.txt")
    if (!pending.exists()) return
    val portName = pending.readText().trim()
    if (portName.isEmpty()) return
    if (FlipperUsbManager.openPort(this, portName)) {
      File(filesDir, "usb_connected.flag").writeText(portName)
      pending.delete()
    }
  }

  /** Rust AndroidUsbPort 通过文件桥接读写 USB 串口 */
  private fun startUsbBridge() {
    if (usbBridgeRunning) return
    usbBridgeRunning = true
    usbBridgeThread = Thread {
      while (usbBridgeRunning && !Thread.currentThread().isInterrupted) {
        try {
          processPendingUsbConnect()
          val writeFile = File(filesDir, "usb_write.bin")
          if (writeFile.exists() && FlipperUsbManager.isPortOpen()) {
            val data = writeFile.readBytes()
            writeFile.delete()
            if (data.isNotEmpty()) {
              FlipperUsbManager.writeBytes(data)
            }
          }
          if (FlipperUsbManager.isPortOpen()) {
            val data = FlipperUsbManager.readBytes(4096, 50)
            if (data.isNotEmpty()) {
              File(filesDir, "usb_read.bin").writeBytes(data)
            }
          }
          Thread.sleep(15)
        } catch (_: InterruptedException) {
          break
        } catch (_: Exception) {
          Thread.sleep(50)
        }
      }
    }.apply {
      isDaemon = true
      name = "FlipperUsbBridge"
      start()
    }
  }

  override fun onDestroy() {
    usbBridgeRunning = false
    usbBridgeThread?.interrupt()
    usbBridgeThread = null
    if (usbReceiverRegistered) {
      usbReceiver?.let { unregisterReceiver(it) }
      usbReceiverRegistered = false
    }
    usbReceiver = null
    FlipperUsbManager.closePort()
    super.onDestroy()
  }

  private fun registerUsbReceiver() {
    if (usbReceiverRegistered) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null) return
        FlipperUsbManager.refreshScanCache(context)
        if (intent?.action == "com.dolphin_gang_tour.app.USB_PERMISSION") {
          processPendingUsbConnect()
        }
      }
    }
    usbReceiver = receiver

    // targetSdk 34+ requires explicit exported flag per receiver registration.
    val systemFilter = IntentFilter().apply {
      addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
      addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
    }
    ContextCompat.registerReceiver(this, receiver, systemFilter, ContextCompat.RECEIVER_EXPORTED)

    val permissionFilter = IntentFilter("com.dolphin_gang_tour.app.USB_PERMISSION")
    ContextCompat.registerReceiver(this, receiver, permissionFilter, ContextCompat.RECEIVER_NOT_EXPORTED)

    usbReceiverRegistered = true
  }
}
