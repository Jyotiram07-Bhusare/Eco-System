package com.ecoroute.station;

import java.util.Arrays;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stations")
public class StationController {

    /** Same shape the front-end uses for a charging station. x / y are positions on the simulated map. */
    public record StationDto(String id, String name, String area, int x, int y, List<String> connectors, int kw, int total, int free,
                             int sampleFree, String type, String icon) {
        public static StationDto of(Station s) {
            return new StationDto(s.id(), s.name(), s.area(), s.x(), s.y(), Arrays.asList(s.connectors().split(",")), s.kw(),
                    s.totalPorts(), s.freePorts(), s.seedFree(), "station", "zap");
        }
    }

    private final StationService service;

    public StationController(StationService service) {
        this.service = service;
    }

    @GetMapping
    public List<StationDto> list() {
        return service.list().stream().map(StationDto::of).toList();
    }

    @PostMapping("/refresh")
    public List<StationDto> refresh() {
        return service.refreshAvailability().stream().map(StationDto::of).toList();
    }
}
