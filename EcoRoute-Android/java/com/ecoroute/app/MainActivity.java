package com.ecoroute.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * EcoRoute for Android: the EcoRoute web app (copied into assets/www by build.ps1) shown full screen in a WebView.
 *
 * - The app files are served to the WebView from the app itself under https://appassets.androidplatform.net/ (a made-up
 *   address that never touches the network). That gives the page a secure https origin, which the browser Geolocation API
 *   and localStorage need, and it is the origin the EcoRoute backend allows for CORS.
 * - Map tiles, routing, place search and chargers are loaded by the page itself from the public OpenStreetMap services.
 * - Location: the page asks the WebView for the position; this class turns that into the normal Android permission dialog.
 * - Links that leave the app (OpenStreetMap credits, ...) open in the phone's browser.
 * - The Back button is handed to the page (window.EcoAppBack), which knows about open dialogs and a running journey.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_LOCATION = 41;

    private WebView web;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // only a build made with build.ps1 -Debug can be inspected from chrome://inspect
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        createWebView();
        web.loadUrl(START_URL);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView() {
        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                    // localStorage: the local profile and journeys
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setSupportMultipleWindows(false);
        // "Use my own server" may be a plain http:// address on the home network; the page itself only ever comes from the app
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " EcoRouteApp/1.0");

        web.addJavascriptInterface(new Bridge(), "EcoApp");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());
    }

    /* ---------- what the page may call (only our own pages are ever loaded into this WebView) ---------- */
    private class Bridge {
        /** Keep the screen on while a journey runs. */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        /** Open the Android settings page of this app (to switch the location permission back on). */
        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                    } catch (ActivityNotFoundException ignored) { /* no settings app */ }
                }
            });
        }
    }

    /* ---------- the app files ---------- */
    private class AppClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!HOST.equals(u.getHost())) return null;                      // every other address: the real network
            String path = u.getPath();
            if (path == null || path.length() == 0 || "/".equals(path)) path = "/index.html";
            if (path.contains("..") || path.contains("\\")) return notFound();
            try {
                InputStream in = getAssets().open("www" + path);
                String mime = mimeOf(path);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg") ? "UTF-8" : null, in);
                r.setStatusCodeAndReasonPhrase(200, "OK");
                r.setResponseHeaders(headers);
                return r;
            } catch (IOException missing) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            WebResourceResponse r = new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream("Not found".getBytes()));
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        }

        /** Links to other sites (the OpenStreetMap credits, ...) open in the phone's browser, not inside the app. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (ActivityNotFoundException ignored) { /* nothing can open it */ }
            return true;
        }

        /** The page process died (out of memory, ...): start the app again instead of closing it. */
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (web != null) {
                ViewGroup parent = (ViewGroup) web.getParent();
                if (parent != null) parent.removeView(web);
                web.destroy();
            }
            createWebView();
            web.loadUrl(START_URL);
            return true;
        }
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    /* ---------- location: the page's request becomes the normal Android permission dialog ---------- */
    private class AppChrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (origin == null || !origin.startsWith("https://" + HOST)) { callback.invoke(origin, false, false); return; }
            if (hasLocationPermission()) { callback.invoke(origin, true, false); return; }
            if (Build.VERSION.SDK_INT < 23) { callback.invoke(origin, true, false); return; }    // granted at install time
            if (geoCallback != null) geoCallback.invoke(geoOrigin, false, false);              // an older question that was never answered
            geoCallback = callback; geoOrigin = origin;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        }

        @Override
        public void onGeolocationPermissionsHidePrompt() {
            geoCallback = null; geoOrigin = null;
        }
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_LOCATION) return;
        boolean granted = false;
        for (int r : grantResults) if (r == PackageManager.PERMISSION_GRANTED) granted = true;
        if (geoCallback != null) geoCallback.invoke(geoOrigin, granted, false);
        geoCallback = null; geoOrigin = null;
    }

    /* ---------- Back: the page decides (close a question, go back a screen, ask before leaving a journey) ---------- */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null) {
            if (event.getRepeatCount() == 0) askPageToGoBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** window.EcoAppBack() (js/navigation.js) answers true when it handled the press. Otherwise (Home, the login screens, a page that is not loaded) the app closes. */
    private void askPageToGoBack() {
        web.evaluateJavascript(
                "(function(){try{return !!(window.EcoAppBack&&window.EcoAppBack());}catch(e){return false;}})()",
                new ValueCallback<String>() {
                    @Override public void onReceiveValue(String handled) {
                        if (!"true".equals(handled)) finish();
                    }
                });
    }

    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) { ViewGroup p = (ViewGroup) web.getParent(); if (p != null) p.removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
}
