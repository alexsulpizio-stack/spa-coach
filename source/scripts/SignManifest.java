import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Key;
import java.security.KeyStore;
import java.security.Signature;
import java.util.Base64;

public class SignManifest {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: SignManifest <keystore> <canonical-payload>");
        String storePassword = required("SPA_COACH_STORE_PASSWORD");
        String keyPassword = required("SPA_COACH_KEY_PASSWORD");
        String alias = required("SPA_COACH_KEY_ALIAS");
        KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
        try (var input = Files.newInputStream(Path.of(args[0]))) {
            store.load(input, storePassword.toCharArray());
        }
        Key key = store.getKey(alias, keyPassword.toCharArray());
        if (key == null) throw new IllegalArgumentException("Signing key alias was not found");
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign((java.security.PrivateKey) key);
        signature.update(Files.readAllBytes(Path.of(args[1])));
        System.out.print(Base64.getEncoder().encodeToString(signature.sign()));
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " is required");
        return value;
    }
}
