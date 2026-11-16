package com.ecoroute.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.security.KeyStore;
import java.util.Collections;
import javax.net.ssl.SSLContext;

import org.junit.jupiter.api.Test;

class OsTrustTest {

    @Test
    void buildsAnSslContext() {
        SSLContext ctx = OsTrust.sslContext();
        assertNotNull(ctx);
        assertNotNull(ctx.getSocketFactory());
    }

    @Test
    void windowsReadsTheOsStore() throws Exception {
        assumeTrue(System.getProperty("os.name", "").toLowerCase().contains("win"), "Windows only");
        assertEquals("Windows-ROOT", OsTrust.osStoreType());
        KeyStore ks = KeyStore.getInstance("Windows-ROOT");
        ks.load(null, null);
        assertTrue(Collections.list(ks.aliases()).size() > 0, "the OS store should hold root certificates");
    }

    @Test
    void linuxUsesTheJvmRootsOnly() {
        assumeTrue(System.getProperty("os.name", "").toLowerCase().contains("linux"), "Linux only");
        assertEquals(null, OsTrust.osStoreType());
    }
}
