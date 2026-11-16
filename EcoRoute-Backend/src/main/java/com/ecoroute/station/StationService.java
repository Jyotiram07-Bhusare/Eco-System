package com.ecoroute.station;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StationService {

    private final StationMapper stations;

    public StationService(StationMapper stations) {
        this.stations = stations;
    }

    public List<Station> list() {
        return stations.findAll();
    }

    /** Sample data: nudges each station's free ports up or down by one so the screen has something to refresh. */
    @Transactional
    public List<Station> refreshAvailability() {
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        for (Station s : stations.findAll()) {
            int delta = new int[] { -1, 0, 0, 1 }[rnd.nextInt(4)];
            int free = Math.max(0, Math.min(s.totalPorts(), s.freePorts() + delta));
            if (free != s.freePorts()) stations.updateFree(s.id(), free);
        }
        return stations.findAll();
    }
}
