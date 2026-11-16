package com.ecoroute.common;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.validation.ConstraintViolationException;

/** One JSON error shape for the whole API: { error, message, fields }. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    public record ApiError(String error, String message, Map<String, String> fields) {}

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(new ApiError(e.code(), e.getMessage(), e.fields()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalidBody(MethodArgumentNotValidException e) {
        Map<String, String> fields = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> fields.putIfAbsent(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.badRequest().body(new ApiError("validation", "Please check the highlighted fields.", fields));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> invalidParams(ConstraintViolationException e) {
        Map<String, String> fields = new LinkedHashMap<>();
        e.getConstraintViolations().forEach(v -> fields.putIfAbsent(v.getPropertyPath().toString(), v.getMessage()));
        return ResponseEntity.badRequest().body(new ApiError("validation", "Invalid request parameters.", fields));
    }

    @ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class })
    ResponseEntity<ApiError> unreadable(Exception e) {
        return ResponseEntity.badRequest().body(new ApiError("bad_request", "The request could not be read.", Map.of()));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<ApiError> duplicate(DuplicateKeyException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError("duplicate", "That record already exists.", Map.of()));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> method(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(new ApiError("method_not_allowed", "Method not allowed.", Map.of()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> missing(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError("not_found", "Not found.", Map.of()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception e) {
        log.error("Unexpected error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("server_error", "Something went wrong on the server.", Map.of()));
    }
}
