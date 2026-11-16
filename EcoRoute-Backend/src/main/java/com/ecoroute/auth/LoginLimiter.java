package com.ecoroute.auth;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

import com.ecoroute.config.AppProperties;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing: after N failed logins for the same email + address, further attempts are
 * refused for a while. In-memory (resets on restart), which is enough for a single-instance app.
 */
@Component
public class LoginLimiter {

    private final int maxFailures;
    private final long windowMs;
    private final LongSupplier clock;
    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();

    @Autowired
    public LoginLimiter(AppProperties props) {
        this(props.auth().maxLoginFailures(), Duration.ofMinutes(props.auth().lockoutMinutes()), System::currentTimeMillis);
    }

    /** For tests: custom limits and clock. */
    LoginLimiter(int maxFailures, Duration window, LongSupplier clock) {
        this.maxFailures = maxFailures;
        this.windowMs = window.toMillis();
        this.clock = clock;
    }

    public boolean isLocked(String key) {
        Deque<Long> q = failures.get(key);
        if (q == null) return false;
        synchronized (q) {
            prune(q);
            return q.size() >= maxFailures;
        }
    }

    public void recordFailure(String key) {
        Deque<Long> q = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q);
            q.addLast(clock.getAsLong());
        }
    }

    public void reset(String key) {
        failures.remove(key);
    }

    private void prune(Deque<Long> q) {
        long cutoff = clock.getAsLong() - windowMs;
        while (!q.isEmpty() && q.peekFirst() < cutoff) q.pollFirst();
    }
}
