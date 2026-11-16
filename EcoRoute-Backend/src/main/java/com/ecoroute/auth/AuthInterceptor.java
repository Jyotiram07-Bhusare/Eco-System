package com.ecoroute.auth;

import com.ecoroute.common.ApiException;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Requires "Authorization: Bearer <token>" on protected endpoints and exposes the user id to controllers. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    /** Request attribute holding the id of the signed-in user. */
    public static final String USER_ID = "ecoroute.userId";

    private final AuthService auth;

    public AuthInterceptor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;       // CORS pre-flight carries no token
        String token = bearerToken(request);
        long userId = auth.authenticate(token).orElseThrow(() -> ApiException.unauthorized("Please log in again."));
        request.setAttribute(USER_ID, userId);
        return true;
    }

    public static String bearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
    }
}
