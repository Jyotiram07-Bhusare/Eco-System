package com.ecoroute.auth;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.ecoroute.common.ApiException;

import org.junit.jupiter.api.Test;

class AuthServiceTest {

    @Test
    void passwordPolicy() {
        assertDoesNotThrow(() -> AuthService.checkPasswordPolicy("Eco12345"));
        assertThrows(ApiException.class, () -> AuthService.checkPasswordPolicy("short1"));          // too short
        assertThrows(ApiException.class, () -> AuthService.checkPasswordPolicy("onlyletters"));     // no digit
        assertThrows(ApiException.class, () -> AuthService.checkPasswordPolicy("12345678"));        // no letter
        assertThrows(ApiException.class, () -> AuthService.checkPasswordPolicy("a1" + "x".repeat(80)));  // over 72 bytes
    }

    @Test
    void tokenHashIsStableHexAndDifferentPerToken() {
        String h = AuthService.sha256("token-one");
        assertEquals(64, h.length());
        assertEquals(h, AuthService.sha256("token-one"));
        assertNotEquals(h, AuthService.sha256("token-two"));
    }
}
