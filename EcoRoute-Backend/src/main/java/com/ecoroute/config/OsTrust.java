package com.ecoroute.config;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * TLS trust for the server's own outbound HTTPS calls (the address lookup): the JVM's built-in root certificates
 * PLUS the operating system's certificate store.
 *
 * Why: some JDK builds do not ship a root that the OS (and every browser) already trusts, or the machine sits behind a
 * proxy / antivirus whose certificate is installed only in the OS store. Without this the lookup fails with
 * "PKIX path building failed" even though the website opens fine in a browser. Certificates are still fully
 * validated (chain, expiry, host name); only the set of trusted roots is wider, exactly like a browser's.
 */
public final class OsTrust {

    private static final Logger log = LoggerFactory.getLogger(OsTrust.class);

    private OsTrust() {}

    /** An SSL context trusting the JVM roots and, where the JDK can read it, the OS store (Windows / macOS). */
    public static SSLContext sslContext() {
        try {
            List<X509TrustManager> managers = new ArrayList<>();
            managers.add(managerFor(null));                                  // the JVM's own roots
            String osStore = osStoreType();
            if (osStore != null) {
                try {
                    KeyStore ks = KeyStore.getInstance(osStore);
                    ks.load(null, null);
                    managers.add(managerFor(ks));
                    log.debug("Also trusting the operating system certificate store ({})", osStore);
                } catch (GeneralSecurityException | IOException | RuntimeException e) {
                    log.info("The operating system certificate store could not be read ({}); using the JVM roots only.", e.getMessage());
                }
            }
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { new Combined(managers) }, null);
            return ctx;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("TLS could not be initialised", e);
        }
    }

    /** The JDK keystore type that exposes the OS root certificates, or null where there is none (Linux uses the JVM's). */
    static String osStoreType() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) return "Windows-ROOT";
        if (os.contains("mac")) return "KeychainStore";
        return null;
    }

    private static X509TrustManager managerFor(KeyStore store) throws GeneralSecurityException {
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(store);                                                     // null = the JVM default trust store
        for (TrustManager tm : tmf.getTrustManagers()) {
            if (tm instanceof X509TrustManager x) return x;
        }
        throw new GeneralSecurityException("No X509TrustManager available");
    }

    /** Accepts a server certificate if ANY of the trust managers accepts it. */
    private record Combined(List<X509TrustManager> managers) implements X509TrustManager {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            check(chain, authType, true);
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            check(chain, authType, false);
        }

        private void check(X509Certificate[] chain, String authType, boolean client) throws CertificateException {
            CertificateException first = null;
            for (X509TrustManager m : managers) {
                try {
                    if (client) m.checkClientTrusted(chain, authType); else m.checkServerTrusted(chain, authType);
                    return;
                } catch (CertificateException e) {
                    if (first == null) first = e;
                }
            }
            throw first != null ? first : new CertificateException("No trust manager accepted the certificate chain");
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            List<X509Certificate> all = new ArrayList<>();
            for (X509TrustManager m : managers) all.addAll(List.of(m.getAcceptedIssuers()));
            return all.toArray(new X509Certificate[0]);
        }
    }
}
