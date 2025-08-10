
package com.scraper2

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class FileDownloaderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "FileDownloader"
    }

    @ReactMethod
    fun downloadFile(url: String, fileName: String, promise: Promise) {
        try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(fileName)
                .setDescription("Downloading")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val downloadManager = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = downloadManager.enqueue(request)
            
            promise.resolve(downloadId.toString())
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_ERROR", e)
        }
    }
}
