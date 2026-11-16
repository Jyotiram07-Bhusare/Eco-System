package com.ecoroute.config;

import java.nio.file.Files;
import java.nio.file.Path;

import com.ecoroute.auth.AuthInterceptor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import jakarta.annotation.PostConstruct;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

    private final AuthInterceptor auth;
    private final AppProperties props;

    @Autowired
    public WebConfig(AuthInterceptor auth, AppProperties props) {
        this.auth = auth;
        this.props = props;
    }

    /** Every /api call needs a login token, except the public ones listed here. */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(auth)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/register", "/api/auth/login", "/api/auth/forgot", "/api/health");
    }

    /** Only matters when the front-end is opened from another host/port (e.g. a live-reload dev server). */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(props.corsOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type")
                .maxAge(3600);
    }

    @PostConstruct
    void checkFrontendFolder() {
        Path dir = Path.of(props.frontendDir()).toAbsolutePath().normalize();
        if (Files.isRegularFile(dir.resolve("index.html"))) {
            log.info("Serving the front-end from {}", dir);
        } else {
            log.warn("Front-end folder not found at {} (set ECOROUTE_FRONTEND). The API still works.", dir);
        }
    }
}
