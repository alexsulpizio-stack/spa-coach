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
import android.provider.Settings;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
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
    private final AtomicBoolean updateCheckInProgress = new AtomicBoolean(false);

    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";

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
        if (!updateCheckInProgress.compareAndSet(false, true)) {
            if (openDownload) sendUpdateStatus("An update check is already running.");
            return;
        }
        new Thread(() -> {
            try {
                URL manifestUrl = requireHttpsUrl(BuildConfig.UPDATE_MANIFEST_URL);
                HttpURLConnection connection = (HttpURLConnection) manifestUrl.openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                int responseCode = connection.getResponseCode();
                if (responseCode < 200 || responseCode >= 300) throw new IOException("Update manifest returned HTTP " + responseCode);
                StringBuilder json = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) json.append(line);
                } finally {
                    connection.disconnect();
                }
                JSONObject update=new JSONObject(json.toString());
                int versionCode=update.getInt("versionCode");
                if(versionCode<=BuildConfig.VERSION_CODE) { sendUpdateStatus("Spa Coach is up to date (v"+BuildConfig.VERSION_NAME+")."); return; }
                String versionName=update.optString("versionName","new version");
                String apkUrl=update.getString("apkUrl");
                String apkSha256=update.getString("apkSha256");
                if (!openDownload) {
                    sendUpdateStatus("Spa Coach v"+versionName+" is available. Open Settings and tap Check for Updates.");
                    return;
                }
                sendUpdateStatus("Downloading Spa Coach v"+versionName+" for verification…");
                File verifiedApk = downloadVerifiedApk(apkUrl, apkSha256);
                sendUpdateStatus("Update verified. Opening Android installer…");
                runOnUiThread(() -> promptInstallVerifiedApk(verifiedApk));
            } catch(SecurityException error) {
                sendUpdateStatus("Update verification failed. The APK was not opened.");
            } catch(Exception error) {
                sendUpdateStatus("Could not check or download the update. Check your connection and try again.");
            } finally {
                updateCheckInProgress.set(false);
            }
        }).start();
    }

    private URL requireHttpsUrl(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new SecurityException("Update URLs must use HTTPS");
        return url;
    }

    private File downloadVerifiedApk(String apkUrl, String expectedSha256) throws Exception {
        String expected = expectedSha256 == null ? "" : expectedSha256.trim().toLowerCase(Locale.ROOT);
        if (!expected.matches("[0-9a-f]{64}")) throw new SecurityException("Invalid APK checksum");

        File updateDirectory = new File(getCacheDir(), "updates");
        if (!updateDirectory.exists() && !updateDirectory.mkdirs()) throw new IOException("Could not create update directory");
        File partial = new File(updateDirectory, "spa-coach-update.apk.part");
        File verified = new File(updateDirectory, "spa-coach-update.apk");
        partial.delete();

        HttpURLConnection connection = (HttpURLConnection) requireHttpsUrl(apkUrl).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        try {
            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) throw new IOException("APK download returned HTTP " + responseCode);
            long advertisedLength = connection.getContentLengthLong();
            if (advertisedLength > MAX_APK_BYTES) throw new IOException("APK is too large");

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_APK_BYTES) throw new IOException("APK is too large");
                    digest.update(buffer, 0, read);
                    output.write(buffer, 0, read);
                }
            }
            if (total == 0) throw new IOException("APK download was empty");

            StringBuilder actual = new StringBuilder(64);
            for (byte value : digest.digest()) actual.append(String.format(Locale.ROOT, "%02x", value & 0xff));
            if (!MessageDigest.isEqual(
                    actual.toString().getBytes(StandardCharsets.US_ASCII),
                    expected.getBytes(StandardCharsets.US_ASCII))) {
                throw new SecurityException("APK checksum mismatch");
            }
            if (verified.exists() && !verified.delete()) throw new IOException("Could not replace old update");
            if (!partial.renameTo(verified)) throw new IOException("Could not finalize update");
            return verified;
        } finally {
            connection.disconnect();
            if (partial.exists()) partial.delete();
        }
    }

    private void promptInstallVerifiedApk(File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            sendUpdateStatus("Allow Spa Coach to install updates, then tap Check for Updates again.");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, APK_MIME_TYPE);
        install.setClipData(ClipData.newRawUri("Verified Spa Coach update", uri));
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(install);
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
