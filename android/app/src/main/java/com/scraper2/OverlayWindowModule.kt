
package com.scraper2

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
            reactApplicationContext.startActivityForResult(intent, 1234, null)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun createOverlay(url: String, promise: Promise) {
        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
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
        val webView = WebView(reactApplicationContext)
        webView.settings.javaScriptEnabled = true
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(WebAppInterface(reactApplicationContext), "Android")
        webView.loadUrl(url)

        overlayView?.addView(webView)
        windowManager?.addView(overlayView, layoutParams)

        promise.resolve(null)
    }

    @ReactMethod
    fun destroyOverlay(promise: Promise) {
        if (overlayView != null) {
            windowManager?.removeView(overlayView)
            overlayView = null
            promise.resolve(null)
        } else {
            promise.reject("NO_OVERLAY", "No overlay to destroy")
        }
    }

    @ReactMethod
    fun shrinkOverlay(promise: Promise) {
        if (overlayView != null) {
            val layoutParams = overlayView?.layoutParams as WindowManager.LayoutParams
            layoutParams.width = 300
            layoutParams.height = 300
            windowManager?.updateViewLayout(overlayView, layoutParams)
            promise.resolve(null)
        } else {
            promise.reject("NO_OVERLAY", "No overlay to shrink")
        }
    }

    @ReactMethod
    fun expandOverlay(promise: Promise) {
        if (overlayView != null) {
            val layoutParams = overlayView?.layoutParams as WindowManager.LayoutParams
            layoutParams.width = WindowManager.LayoutParams.MATCH_PARENT
            layoutParams.height = WindowManager.LayoutParams.MATCH_PARENT
            windowManager?.updateViewLayout(overlayView, layoutParams)
            promise.resolve(null)
        } else {
            promise.reject("NO_OVERLAY", "No overlay to expand")
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
