package com.ecoroute.demo;

import com.ecoroute.common.Times;
import com.ecoroute.config.AppProperties;
import com.ecoroute.user.UserMapper;
import com.ecoroute.user.UserService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Creates the demo account (with sample vehicles and journeys) the first time the app starts. */
@Component
public class DemoSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);

    private final AppProperties props;
    private final UserMapper users;
    private final UserService userService;
    private final DemoDataService demo;
    private final PasswordEncoder encoder;

    public DemoSeeder(AppProperties props, UserMapper users, UserService userService, DemoDataService demo, PasswordEncoder encoder) {
        this.props = props;
        this.users = users;
        this.userService = userService;
        this.demo = demo;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        AppProperties.Demo cfg = props.demo();
        if (!cfg.enabled()) return;
        String email = UserService.normalizeEmail(cfg.email());
        if (users.findByEmail(email) != null) return;

        long id = userService.create("Alex Morgan", email, encoder.encode(cfg.password()), Times.nowUtc().minusDays(96));
        userService.updateProfile(id, new UserService.ProfileUpdate("Alex Morgan", email, "+91 98765 43210", "Greenville", 0));
        demo.loadSampleData(id);
        log.info("Demo account created: {} (password from ecoroute.demo.password)", email);
    }
}
