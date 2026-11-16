package com.ecoroute.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

class LoginLimiterTest {

    private final AtomicLong now = new AtomicLong(1_000_000);
    private final LoginLimiter limiter = new LoginLimiter(3, Duration.ofMinutes(10), now::get);

    @Test
    void locksAfterTooManyFailuresAndUnlocksAfterTheWindow() {
        assertFalse(limiter.isLocked("a|1"));
        limiter.recordFailure("a|1");
        limiter.recordFailure("a|1");
        assertFalse(limiter.isLocked("a|1"));
        limiter.recordFailure("a|1");
        assertTrue(limiter.isLocked("a|1"));

        now.addAndGet(Duration.ofMinutes(11).toMillis());
        assertFalse(limiter.isLocked("a|1"));
    }

    @Test
    void aSuccessfulLoginClearsTheCounterAndOtherKeysAreIndependent() {
        limiter.recordFailure("a|1");
        limiter.recordFailure("a|1");
        limiter.reset("a|1");
        limiter.recordFailure("a|1");
        assertFalse(limiter.isLocked("a|1"));

        limiter.recordFailure("b|1");
        limiter.recordFailure("b|1");
        limiter.recordFailure("b|1");
        assertTrue(limiter.isLocked("b|1"));
        assertFalse(limiter.isLocked("a|1"));
    }
}
