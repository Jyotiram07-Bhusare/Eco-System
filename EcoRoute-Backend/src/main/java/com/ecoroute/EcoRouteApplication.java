package com.ecoroute;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * EcoRoute backend: REST API + MySQL persistence + live-location storage.
 * Also serves the front-end (../EcoRoute) so the whole app runs from one origin.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class EcoRouteApplication {

    public static void main(String[] args) {
        SpringApplication.run(EcoRouteApplication.class, args);
    }
}
