package com.dolphin_gang_tour.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Log
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/**
 * Android USB OTG / 拓展坞 Flipper 检测与串口通信。
 * Rust 侧通过读写 cache 文件 + JNI 调用静态方法交互。
 */
object FlipperUsbManager {
    private const val TAG = "FlipperUsb"
    private const val FLIPPER_VID = 0x0483
    private const val PID_NORMAL = 0x5740
    private const val PID_DFU = 0xDF11

    private val openPort = AtomicReference<UsbSerialPort?>(null)
    private var openPortName: String? = null

    @JvmStatic
    fun scanDevicesJson(context: Context): String {
        val arr = JSONArray()
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
        for (driver in drivers) {
            val device = driver.device
            if (device.vendorId != FLIPPER_VID) continue
            val pid = device.productId
            val mode = when (pid) {
                PID_NORMAL -> "normal"
                PID_DFU -> "dfu"
                else -> "unknown"
            }
            val portName = "USB:${device.deviceId}"
            val obj = JSONObject()
            obj.put("portName", portName)
            obj.put("vid", device.vendorId)
            obj.put("pid", pid)
            obj.put("mode", mode)
            obj.put("friendlyName", device.productName ?: "Flipper Zero")
            obj.put("connectable", mode == "normal")
            arr.put(obj)
        }
        for (device in usbManager.deviceList.values) {
            if (device.vendorId != FLIPPER_VID) continue
            val portName = "USB:${device.deviceId}"
            var exists = false
            for (i in 0 until arr.length()) {
                if (arr.getJSONObject(i).getString("portName") == portName) {
                    exists = true
                    break
                }
            }
            if (!exists) {
                val pid = device.productId
                val mode = when (pid) {
                    PID_NORMAL -> "normal"
                    PID_DFU -> "dfu"
                    else -> "unknown"
                }
                val obj = JSONObject()
                obj.put("portName", portName)
                obj.put("vid", device.vendorId)
                obj.put("pid", pid)
                obj.put("mode", mode)
                obj.put("friendlyName", device.productName ?: "Flipper Zero")
                obj.put("connectable", mode == "normal")
                arr.put(obj)
            }
        }
        return arr.toString()
    }

    @JvmStatic
    fun refreshScanCache(context: Context) {
        try {
            val file = cacheFile(context)
            file.parentFile?.mkdirs()
            file.writeText(scanDevicesJson(context))
        } catch (e: Exception) {
            Log.w(TAG, "refreshScanCache failed", e)
        }
    }

    @JvmStatic
    fun readScanCache(context: Context): String {
        return try {
            val file = cacheFile(context)
            if (file.exists()) file.readText() else "[]"
        } catch (_: Exception) {
            "[]"
        }
    }

    private fun cacheFile(context: Context): File =
        File(context.filesDir, "flipper_usb_scan.json")

    @JvmStatic
    fun openPort(context: Context, portName: String): Boolean {
        closePort()
        if (!portName.startsWith("USB:")) return false
        val deviceId = portName.removePrefix("USB:").toIntOrNull() ?: return false
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find { it.deviceId == deviceId } ?: return false
        if (!usbManager.hasPermission(device)) {
            val intent = PendingIntent.getBroadcast(
                context, 0,
                Intent("com.dolphin_gang_tour.app.USB_PERMISSION"),
                PendingIntent.FLAG_IMMUTABLE
            )
            usbManager.requestPermission(device, intent)
            return false
        }
        val driver = UsbSerialProber.getDefaultProber().probeDevice(device) ?: return false
        if (driver.ports.isEmpty()) {
            Log.w(TAG, "No serial ports on device $portName")
            return false
        }
        val connection = usbManager.openDevice(device) ?: return false
        val port = driver.ports[0]
        port.open(connection)
        port.setParameters(115200, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
        port.dtr = true
        port.rts = true
        openPort.set(port)
        openPortName = portName
        Log.i(TAG, "USB port opened: $portName")
        return true
    }

    @JvmStatic
    fun isPortOpen(): Boolean = openPort.get() != null

    @JvmStatic
    fun closePort() {
        try {
            openPort.getAndSet(null)?.close()
        } catch (e: Exception) {
            Log.w(TAG, "closePort", e)
        }
        openPortName = null
    }

    @JvmStatic
    fun writeBytes(data: ByteArray): Int {
        val port = openPort.get() ?: return -1
        return try {
            port.write(data, 2000)
            data.size
        } catch (e: Exception) {
            Log.w(TAG, "writeBytes", e)
            -1
        }
    }

    @JvmStatic
    fun readBytes(maxLen: Int, timeoutMs: Int): ByteArray {
        val port = openPort.get() ?: return ByteArray(0)
        val buf = ByteArray(maxLen.coerceAtMost(4096))
        return try {
            val n = port.read(buf, timeoutMs.coerceAtLeast(50))
            if (n <= 0) ByteArray(0) else buf.copyOf(n)
        } catch (e: Exception) {
            Log.w(TAG, "readBytes", e)
            ByteArray(0)
        }
    }

    @JvmStatic
    fun currentPortName(): String = openPortName ?: ""
}
