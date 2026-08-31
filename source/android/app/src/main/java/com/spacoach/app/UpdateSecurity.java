package com.spacoach.app;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

final class UpdateSecurity {
    private UpdateSecurity() {}

    static void verifyManifest(JSONObject manifest, PublicKey trustedKey) throws Exception {
        if (!BuildConfig.APPLICATION_ID.equals(manifest.getString("packageName"))) {
            throw new SecurityException("Unexpected update package");
        }
        requireDigest(manifest.getString("apkSha256"));
        requireDigest(manifest.getString("signingCertSha256"));
        JSONObject signature = manifest.getJSONObject("signature");
        if (!"RS256".equals(signature.getString("alg"))) throw new SecurityException("Unsupported manifest signature");
        java.security.Signature verifier = java.security.Signature.getInstance("SHA256withRSA");
        verifier.initVerify(trustedKey);
        verifier.update(canonicalPayload(manifest).getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.getDecoder().decode(signature.getString("value")))) {
            throw new SecurityException("Manifest signature mismatch");
        }
    }

    static URL cacheBustedManifestUrl(String baseUrl, int installedVersion, long nonce) throws Exception {
        String separator = baseUrl.contains("?") ? "&" : "?";
        return new URL(baseUrl + separator + "installedVersion=" + installedVersion + "&nonce=" + nonce);
    }

    static String canonicalPayload(JSONObject manifest) throws Exception {
        JSONObject unsigned = new JSONObject(manifest.toString());
        unsigned.remove("signature");
        return canonicalValue(unsigned);
    }

    private static String canonicalValue(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            List<String> keys = new ArrayList<>();
            Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            Collections.sort(keys);
            StringBuilder result = new StringBuilder("{");
            for (int index = 0; index < keys.size(); index++) {
                if (index > 0) result.append(',');
                String key = keys.get(index);
                result.append(quoteJson(key)).append(':').append(canonicalValue(object.get(key)));
            }
            return result.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder result = new StringBuilder("[");
            for (int index = 0; index < array.length(); index++) {
                if (index > 0) result.append(',');
                result.append(canonicalValue(array.get(index)));
            }
            return result.append(']').toString();
        }
        if (value instanceof String) return quoteJson((String) value);
        if (value instanceof Boolean || value instanceof Number) return value.toString();
        throw new SecurityException("Unsupported manifest value");
    }

    // Same escaping as Android org.json JSONObject.quote, including solidus.
    static String quoteJson(String data) {
        StringBuilder out = new StringBuilder(data.length() + 2);
        out.append('"');
        for (int index = 0; index < data.length(); index++) {
            char character = data.charAt(index);
            switch (character) {
                case '"':
                case '\\':
                case '/':
                    out.append('\\').append(character);
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                case '\b':
                    out.append("\\b");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\f':
                    out.append("\\f");
                    break;
                default:
                    if (character < 32) {
                        out.append(String.format(Locale.ROOT, "\\u%04x", (int) character));
                    } else {
                        out.append(character);
                    }
            }
        }
        return out.append('"').toString();
    }

    static PublicKey installedSigningPublicKey(PackageManager manager) throws Exception {
        Signature signer = firstSigner(packageInfo(manager, BuildConfig.APPLICATION_ID, false));
        X509Certificate certificate = (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(signer.toByteArray()));
        return certificate.getPublicKey();
    }

    static void verifyApkIdentity(File apk, JSONObject manifest, PackageManager manager) throws Exception {
        PackageInfo info = packageInfo(manager, apk.getAbsolutePath(), true);
        if (info == null || !BuildConfig.APPLICATION_ID.equals(info.packageName)) {
            throw new SecurityException("APK package name mismatch");
        }
        long archiveVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        if (archiveVersion != manifest.getLong("versionCode")) throw new SecurityException("APK version mismatch");
        String actual = sha256Hex(firstSigner(info).toByteArray());
        String expected = manifest.getString("signingCertSha256").toLowerCase(Locale.ROOT);
        if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII))) {
            throw new SecurityException("APK signing certificate mismatch");
        }
    }

    private static PackageInfo packageInfo(PackageManager manager, String value, boolean archive) throws Exception {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        return archive ? manager.getPackageArchiveInfo(value, flags) : manager.getPackageInfo(value, flags);
    }

    private static Signature firstSigner(PackageInfo info) {
        Signature[] signers;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) throw new SecurityException("Signing information is missing");
            signers = info.signingInfo.hasMultipleSigners()
                    ? info.signingInfo.getApkContentsSigners()
                    : info.signingInfo.getSigningCertificateHistory();
        } else {
            signers = info.signatures;
        }
        if (signers == null || signers.length == 0) throw new SecurityException("APK is unsigned");
        return signers[0];
    }

    private static void requireDigest(String value) {
        if (value == null || !value.toLowerCase(Locale.ROOT).matches("[0-9a-f]{64}")) {
            throw new SecurityException("Invalid update digest");
        }
    }

    static String sha256Hex(byte[] bytes) throws Exception {
        StringBuilder result = new StringBuilder(64);
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) {
            result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        }
        return result.toString();
    }
}
