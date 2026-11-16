package com.ecoroute.auth;

import java.util.Map;

import com.ecoroute.user.UserController;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    public record RegisterRequest(
            @NotBlank(message = "Enter your full name") @Size(max = 80) String name,
            @NotBlank(message = "Enter your email address") @Size(max = 190)
            @Pattern(regexp = UserController.EMAIL_REGEX, message = "Enter a valid email address") String email,
            @NotBlank(message = "Create a password") @Size(max = 200) String password) {}

    public record LoginRequest(
            @NotBlank(message = "Enter your email address") @Size(max = 190) String email,
            @NotBlank(message = "Enter your password") @Size(max = 200) String password) {}

    public record ForgotRequest(
            @NotBlank(message = "Enter your email address") @Size(max = 190)
            @Pattern(regexp = UserController.EMAIL_REGEX, message = "Enter a valid email address") String email) {}

    public record AuthResponse(String token, UserController.UserDto user) {}

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest r, HttpServletRequest http) {
        AuthService.Session s = auth.register(r.name(), r.email(), r.password(), http.getHeader("User-Agent"));
        log.info("New account registered (id {})", s.user().id());
        return new AuthResponse(s.token(), UserController.UserDto.of(s.user()));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest r, HttpServletRequest http) {
        AuthService.Session s = auth.login(r.email(), r.password(), http.getRemoteAddr(), http.getHeader("User-Agent"));
        return new AuthResponse(s.token(), UserController.UserDto.of(s.user()));
    }

    /** Ends this device's session. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest http) {
        auth.revoke(AuthInterceptor.bearerToken(http));
    }

    /**
     * Password reset needs an e-mail service, which this demo does not have. The call always succeeds, so it never
     * reveals whether an address is registered, and it only writes a log line.
     */
    @PostMapping("/forgot")
    public Map<String, Object> forgot(@Valid @RequestBody ForgotRequest r) {
        log.info("Password reset requested (no e-mail service is configured, nothing was sent)");
        return Map.of("ok", true, "message", "If that address is registered, reset instructions would be sent.");
    }
}
