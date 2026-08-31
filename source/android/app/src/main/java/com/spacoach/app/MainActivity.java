package com.spacoach.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4100;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4101;
    private static final int BACKUP_SAVE_REQUEST = 4102;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String pendingLaunchAction;
    private boolean pageReady = false;
    private String pendingBackupJson;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureNotificationChannel();
        handleLaunchIntent(getIntent());

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new SpaBridge(this), "SpaNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                dispatchPendingLaunchAction();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                openImageChooser(params != null && params.isCaptureEnabled());
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent);
        dispatchPendingLaunchAction();
    }

    private void handleLaunchIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("spa_action");
        if (action == null && "com.spacoach.app.OPEN_RETEST".equals(intent.getAction())) action = "retest";
        if (action != null) pendingLaunchAction = action;
    }

    private void dispatchPendingLaunchAction() {
        if (!pageReady || pendingLaunchAction == null || webView == null) return;
        final String action = pendingLaunchAction.replace("'", "");
        pendingLaunchAction = null;
        webView.post(() -> webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('spa-native-reminder',{detail:{action:'" + action + "'}}));",
            null
        ));
    }

    void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    void checkForUpdates() { checkForUpdates(true); }

    void checkForUpdates(boolean openDownload) {
        new Thread(() -> {
            try {
                if (BuildConfig.UPDATE_MANIFEST_URL.contains("example.invalid")) {
                    sendUpdateStatus("OTA is ready, but its HTTPS update address must be configured before publishing.");
                    return;
                }
                HttpURLConnection connection=(HttpURLConnection)new URL(BuildConfig.UPDATE_MANIFEST_URL).openConnection();
                connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
                BufferedReader reader=new BufferedReader(new InputStreamReader(connection.getInputStream()));
                StringBuilder json=new StringBuilder(); String line;
                while((line=reader.readLine())!=null) json.append(line);
                JSONObject update=new JSONObject(json.toString());
                int versionCode=update.getInt("versionCode");
                if(versionCode<=BuildConfig.VERSION_CODE) { sendUpdateStatus("Spa Coach is up to date (v"+BuildConfig.VERSION_NAME+")."); return; }
                String versionName=update.optString("versionName","new version");
                String apkUrl=update.getString("apkUrl");
                sendUpdateStatus("Spa Coach v"+versionName+" is available. Opening the secure download…");
                if (openDownload) runOnUiThread(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl))));
                else sendUpdateStatus("Spa Coach v"+versionName+" is available. Open Settings and tap Check for Updates.");
            } catch(Exception error) { sendUpdateStatus("Could not check for updates. Check your connection and try again."); }
        }).start();
    }

    private void sendUpdateStatus(String message) {
        if(webView==null)return;
        final String safe=JSONObject.quote(message);
        webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('spa-update-status',{detail:"+safe+"}));",null));
    }

    void saveBackup(String json, String filename) {
        pendingBackupJson = json;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, safeBackupFilename(filename));
        startActivityForResult(intent, BACKUP_SAVE_REQUEST);
    }

    void shareBackup(String json, String filename) {
        try {
            File file = new File(getCacheDir(), safeBackupFilename(filename));
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(json.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("application/json");
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.putExtra(Intent.EXTRA_SUBJECT, "Spa Coach full backup");
            share.setClipData(ClipData.newRawUri("Spa Coach backup", uri));
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(share, "Save or share Spa Coach backup"));
            sendBackupStatus("Backup ready to share.");
        } catch (Exception error) {
            sendBackupStatus("Could not prepare the backup for sharing.");
        }
    }

    private String safeBackupFilename(String filename) {
        String safe = filename == null ? "spa-coach-backup.json" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
        return safe.endsWith(".json") ? safe : safe + ".json";
    }

    private void sendBackupStatus(String message) {
        if (webView == null) return;
        final String safe = JSONObject.quote(message);
        webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('spa-backup-status',{detail:" + safe + "}));", null));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST && webView != null) {
            String status = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
            webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('spa-notification-permission',{detail:'" + status + "'}));",
                null
            ));
        }
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            NotificationReceiver.CHANNEL_ID,
            "Spa retest reminders",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Water-test and maintenance follow-up reminders from Spa Coach");
        nm.createNotificationChannel(channel);
    }

    private void openImageChooser(boolean captureOnly) {
        Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
        gallery.addCategory(Intent.CATEGORY_OPENABLE);
        gallery.setType("image/*");

        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        cameraUri = null;
        if (camera.resolveActivity(getPackageManager()) != null) {
            try {
                File photo = File.createTempFile("spa_strip_", ".jpg", getCacheDir());
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photo);
                camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                camera.setClipData(ClipData.newRawUri("spa_strip", cameraUri));
                camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (IOException ignored) {
                camera = null;
            }
        } else {
            camera = null;
        }

        if (captureOnly && camera != null) {
            startActivityForResult(camera, FILE_CHOOSER_REQUEST);
            return;
        }
        Intent chooser = Intent.createChooser(gallery, "Choose test-strip photo");
        startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == BACKUP_SAVE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingBackupJson != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output == null) throw new IOException("Could not open destination");
                    output.write(pendingBackupJson.getBytes(StandardCharsets.UTF_8));
                    sendBackupStatus("Backup saved successfully.");
                } catch (Exception error) {
                    sendBackupStatus("Could not save the backup.");
                }
            } else {
                sendBackupStatus("Backup save canceled.");
            }
            pendingBackupJson = null;
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (cameraUri != null) results = new Uri[]{cameraUri};
            } else {
                Uri selected = data.getData();
                if (selected != null) results = new Uri[]{selected};
            }
        }
        fileCallback.onReceiveValue(results);
        fileCallback = null;
        cameraUri = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
