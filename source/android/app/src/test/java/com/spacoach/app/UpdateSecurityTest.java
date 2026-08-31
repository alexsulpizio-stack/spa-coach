package com.spacoach.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class UpdateSecurityTest {
    @Test
    public void manifestUrlIsUniqueAndPreservesExistingQuery() throws Exception {
        String first = UpdateSecurity.cacheBustedManifestUrl("https://example.com/update.json", 91, 1234).toString();
        String second = UpdateSecurity.cacheBustedManifestUrl("https://example.com/update.json?channel=stable", 91, 5678).toString();
        assertTrue(first.endsWith("?installedVersion=91&nonce=1234"));
        assertTrue(second.endsWith("&installedVersion=91&nonce=5678"));
    }

    @Test
    public void canonicalPayloadMatchesAndroidJsonQuoteIncludingSolidus() throws Exception {
        String digest = "a".repeat(64);
        JSONObject manifest = new JSONObject()
                .put("versionCode", 93)
                .put("versionName", "0.9.3")
                .put("packageName", BuildConfig.APPLICATION_ID)
                .put("apkUrl", "https://example.com/Spa-Coach.apk")
                .put("apkSha256", digest)
                .put("signingCertSha256", digest)
                .put("notes", "slash/test");
        String canonical = UpdateSecurity.canonicalPayload(manifest);
        assertEquals(
                "{\"apkSha256\":\"" + digest + "\",\"apkUrl\":\"https:\\/\\/example.com\\/Spa-Coach.apk\","
                        + "\"notes\":\"slash\\/test\",\"packageName\":\"com.spacoach.app\","
                        + "\"signingCertSha256\":\"" + digest + "\",\"versionCode\":93,\"versionName\":\"0.9.3\"}",
                canonical
        );
    }

    @Test
    public void signedManifestPassesAndTamperingFails() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        String digest = "a".repeat(64);
        JSONObject manifest = new JSONObject()
                .put("versionCode", 999)
                .put("versionName", "9.9.9")
                .put("packageName", BuildConfig.APPLICATION_ID)
                .put("apkUrl", "https://example.com/app.apk")
                .put("apkSha256", digest)
                .put("signingCertSha256", digest)
                .put("notes", "test");
        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(pair.getPrivate());
        signer.update(UpdateSecurity.canonicalPayload(manifest).getBytes(StandardCharsets.UTF_8));
        manifest.put("signature", new JSONObject()
                .put("alg", "RS256")
                .put("value", Base64.getEncoder().encodeToString(signer.sign())));

        UpdateSecurity.verifyManifest(manifest, pair.getPublic());
        manifest.put("apkUrl", "https://attacker.invalid/app.apk");
        assertThrows(SecurityException.class, () -> UpdateSecurity.verifyManifest(manifest, pair.getPublic()));
    }
}
