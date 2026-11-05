package com.libnoname.noname

import android.os.Bundle
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebViewClient

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SafFsPlugin::class.java)
        super.onCreate(savedInstanceState)

        val webView = bridge.webView
        val devUrl = if (BuildConfig.DEBUG) intent.getStringExtra("nonameDevUrl") else null
        if (devUrl != null && devUrl.matches(Regex("^http://(?:10\\.0\\.2\\.2|127\\.0\\.0\\.1|localhost):[0-9]+/?$"))) {
            webView.loadUrl(devUrl)
            return
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("localhost")
            .addPathHandler("/", JsAwarePathHandler(this, "public"))
            .build()

        webView.webViewClient = object : BridgeWebViewClient(bridge) {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return if (request.url.host == "localhost") {
                    assetLoader.shouldInterceptRequest(request.url)
                        ?: super.shouldInterceptRequest(view, request)
                } else {
                    super.shouldInterceptRequest(view, request)
                }
            }
        }

        if (bridge.config.isResolveServiceWorkerRequests) {
            val swController = ServiceWorkerController.getInstance()
            swController.setServiceWorkerClient(
                object : ServiceWorkerClient() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
                        return if (request.url.host == "localhost") {
                            assetLoader.shouldInterceptRequest(request.url)
                                ?: bridge.localServer.shouldInterceptRequest(request)
                        } else {
                            bridge.localServer.shouldInterceptRequest(request)
                        }
                    }
                }
            )
        }

        webView.loadUrl("https://localhost/index.html")
    }
}
