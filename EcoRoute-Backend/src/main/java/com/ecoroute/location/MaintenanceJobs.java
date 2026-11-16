package com.ecoroute.location;

import com.ecoroute.auth.TokenMapper;
import com.ecoroute.common.Times;
import com.ecoroute.config.AppProperties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Nightly housekeeping: old location points and expired login tokens are removed. */
@Component
public class MaintenanceJobs {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceJobs.class);

    private final LocationMapper locations;
    private final TokenMapper tokens;
    private final AppProperties props;

    public MaintenanceJobs(LocationMapper locations, TokenMapper tokens, AppProperties props) {
        this.locations = locations;
        this.tokens = tokens;
        this.props = props;
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void purge() {
        int points = locations.deleteOlderThan(Times.nowUtc().minusDays(props.location().retentionDays()));
        int expired = tokens.deleteExpired(Times.nowUtc());
        log.info("Housekeeping: removed {} old location points and {} expired tokens", points, expired);
    }
}
