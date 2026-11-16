package com.ecoroute.common;

import java.util.Map;

import org.springframework.http.HttpStatus;

/** An error that is the caller's fault and is reported to them as JSON (see GlobalExceptionHandler). */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final transient Map<String, String> fields;

    public ApiException(HttpStatus status, String code, String message, Map<String, String> fields) {
        super(message);
        this.status = status;
        this.code = code;
        this.fields = fields == null ? Map.of() : fields;
    }

    public HttpStatus status() { return status; }

    public String code() { return code; }

    public Map<String, String> fields() { return fields; }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message, null);
    }

    public static ApiException invalidField(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message, Map.of(field, message));
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", message, null);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", message, null);
    }

    public static ApiException conflict(String code, String message, Map<String, String> fields) {
        return new ApiException(HttpStatus.CONFLICT, code, message, fields);
    }

    public static ApiException tooManyRequests(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_requests", message, null);
    }
}
