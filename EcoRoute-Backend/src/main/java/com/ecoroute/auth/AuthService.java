package com.ecoroute.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

import com.ecoroute.common.ApiException;
import com.ecoroute.common.Times;
import com.ecoroute.config.AppProperties;
import com.ecoroute.user.User;
import com.ecoroute.user.UserMapper;
import com.ecoroute.user.UserService;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    /** Result of a successful login / registration. */
    public record Session(String token, User user) {}

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration TOUCH_EVERY = Duration.ofMinutes(10);

    private final UserService userService;
    private final UserMapper users;
    private final TokenMapper tokens;
    private final PasswordEncoder encoder;
    private final LoginLimiter limiter;
    private final AppProperties props;
    /** Compared against when the email is unknown, so that "no such user" and "wrong password" take equally long. */
    private final String dummyHash;

    public AuthService(UserService userService, UserMapper users, TokenMapper tokens, PasswordEncoder encoder,
                       LoginLimiter limiter, AppProperties props) {
        this.userService = userService;
        this.users = users;
        this.tokens = tokens;
        this.encoder = encoder;
        this.limiter = limiter;
        this.props = props;
        this.dummyHash = encoder.encode("not-a-real-password");
    }

    @Transactional
    public Session register(String name, String email, String password, String userAgent) {
        String e = UserService.normalizeEmail(email);
        checkPasswordPolicy(password);
        if (users.findByEmail(e) != null) {
            throw ApiException.conflict("email_taken", "This email is already registered.", Map.of("email", "This email is already registered. Try logging in."));
        }
        long id = userService.create(name.trim(), e, encoder.encode(password));
        return new Session(issueToken(id, userAgent), userService.require(id));
    }

    public Session login(String email, String password, String clientAddress, String userAgent) {
        String e = UserService.normalizeEmail(email);
        String key = e + "|" + clientAddress;
        if (limiter.isLocked(key)) {
            throw ApiException.tooManyRequests("Too many failed attempts. Please wait a few minutes and try again.");
        }
        User u = users.findByEmail(e);
        boolean ok = encoder.matches(password, u != null ? u.passwordHash() : dummyHash) && u != null;
        if (!ok) {
            limiter.recordFailure(key);
            throw ApiException.unauthorized("Incorrect email or password.");
        }
        limiter.reset(key);
        return new Session(issueToken(u.id(), userAgent), u);
    }

    /** Returns the user id behind a raw bearer token, if it is valid. */
    public Optional<Long> authenticate(String rawToken) {
        if (rawToken == null || rawToken.length() < 20 || rawToken.length() > 100) return Optional.empty();
        String hash = sha256(rawToken);
        LocalDateTime now = Times.nowUtc();
        TokenMapper.TokenRow row = tokens.findValid(hash, now);
        if (row == null) return Optional.empty();
        if (row.lastUsedAt().isBefore(now.minus(TOUCH_EVERY))) tokens.touch(hash, now);
        return Optional.of(row.userId());
    }

    public void revoke(String rawToken) {
        if (rawToken != null) tokens.delete(sha256(rawToken));
    }

    private String issueToken(long userId, String userAgent) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        LocalDateTime now = Times.nowUtc();
        String ua = userAgent == null ? null : (userAgent.length() > 255 ? userAgent.substring(0, 255) : userAgent);
        tokens.insert(sha256(token), userId, now, now.plusDays(props.auth().tokenTtlDays()), ua);
        return token;
    }

    /** At least 8 characters (BCrypt reads at most 72 bytes), with a letter and a number. */
    static void checkPasswordPolicy(String password) {
        String p = password == null ? "" : password;
        if (p.length() < 8) throw ApiException.invalidField("password", "Use at least 8 characters.");
        if (p.getBytes(StandardCharsets.UTF_8).length > 72) throw ApiException.invalidField("password", "Password is too long (72 bytes at most).");
        if (!p.matches(".*[A-Za-z].*") || !p.matches(".*\\d.*")) throw ApiException.invalidField("password", "Include at least one letter and one number.");
    }

    static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
