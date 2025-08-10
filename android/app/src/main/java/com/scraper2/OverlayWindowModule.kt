package com.scraper2

import android.content.Context
import android.content.Intent
import android.graphics.Point
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayWindowModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var overlayView: LinearLayout? = null
    private var windowManager: WindowManager? = null
    private lateinit var layoutParams: WindowManager.LayoutParams

    override fun getName(): String {
        return "OverlayWindow"
    }

    @ReactMethod
    fun hasPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + reactApplicationContext.packageName))
            currentActivity?.startActivityForResult(intent, 1234)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun createOverlay(url: String, injectedJavaScript: String, promise: Promise) {
        currentActivity?.runOnUiThread {
            val display = windowManager?.defaultDisplay
            val size = Point()
            display?.getSize(size)
            val width = (size.x * 0.5).toInt()
            val height = (size.y * 0.5).toInt()

            layoutParams = WindowManager.LayoutParams(
                width,
                height,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    WindowManager.LayoutParams.TYPE_PHONE
                },
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                -3
            )

            windowManager = reactApplicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            overlayView = LinearLayout(reactApplicationContext)
            overlayView?.orientation = LinearLayout.VERTICAL

            val webView = WebView(reactApplicationContext)
            webView.settings.javaScriptEnabled = true
            webView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    webView.evaluateJavascript(injectedJavaScript, null)
                }
            }
            webView.addJavascriptInterface(WebAppInterface(reactApplicationContext), "Android")
            webView.loadUrl(url)
            webView.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f)

            val handle = View(reactApplicationContext)
            handle.setBackgroundColor(-0x7f000001)
            handle.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 50)
            handle.setOnTouchListener(object : View.OnTouchListener {
                private var initialX: Int = 0
                private var initialY: Int = 0
                private var initialTouchX: Float = 0.toFloat()
                private var initialTouchY: Float = 0.toFloat()

                override fun onTouch(v: View, event: MotionEvent): Boolean {
                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> {
                            initialX = layoutParams.x
                            initialY = layoutParams.y
                            initialTouchX = event.rawX
                            initialTouchY = event.rawY
                            return true
                        }
                        MotionEvent.ACTION_UP -> return true
                        MotionEvent.ACTION_MOVE -> {
                            layoutParams.x = initialX + (event.rawX - initialTouchX).toInt()
                            layoutParams.y = initialY + (event.rawY - initialTouchY).toInt()
                            windowManager?.updateViewLayout(overlayView, layoutParams)
                            return true
                        }
                    }
                    return false
                }
            })

            overlayView?.addView(handle)
            overlayView?.addView(webView)
            windowManager?.addView(overlayView, layoutParams)

            promise.resolve(null)
        }
    }

    @ReactMethod
    fun destroyOverlay(promise: Promise) {
        currentActivity?.runOnUiThread {
            if (overlayView != null) {
                windowManager?.removeView(overlayView)
                overlayView = null
            }
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun shrinkOverlay(promise: Promise) {
        currentActivity?.runOnUiThread {
            if (overlayView != null) {
                val display = windowManager?.defaultDisplay
                val size = Point()
                display?.getSize(size)
                val width = (size.x * 0.2).toInt()
                val height = (size.y * 0.2).toInt()

                layoutParams.width = width
                layoutParams.height = height
                windowManager?.updateViewLayout(overlayView, layoutParams)
            }
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun expandOverlay(promise: Promise) {
        currentActivity?.runOnUiThread {
            if (overlayView != null) {
                val display = windowManager?.defaultDisplay
                val size = Point()
                display?.getSize(size)
                val width = (size.x * 0.5).toInt()
                val height = (size.y * 0.5).toInt()

                layoutParams.width = width
                layoutParams.height = height
                windowManager?.updateViewLayout(overlayView, layoutParams)
            }
            promise.resolve(null)
        }
    }

    inner class WebAppInterface(private val mContext: Context) {
        @JavascriptInterface
        fun postMessage(message: String) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onMessage", message)
        }
    }
}