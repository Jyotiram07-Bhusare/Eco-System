package com.ecoroute.vehicle;

import java.util.List;

import com.ecoroute.auth.AuthInterceptor;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/vehicles")
public class VehicleController {

    /** Same shape the front-end uses for a vehicle object. */
    public record VehicleDto(String id, String type, String company, String model, String fuel, boolean ev, boolean generic,
                             Double mileage, Double battery, int range, String label, Double whPerKm, int gPerKm) {
        public static VehicleDto of(Vehicle v) {
            return new VehicleDto("veh-" + v.id(), v.type(), v.company(), v.model(), v.fuel(), "Electric".equals(v.fuel()), false,
                    v.mileage(), v.batteryKwh(), v.rangeKm(), (v.company() + " " + v.model()).trim(), v.whPerKm(), v.gPerKm());
        }
    }

    public record CreateRequest(
            @NotBlank @Pattern(regexp = "petrol-bike|petrol-car|diesel-car|electric-bike|electric-car", message = "Unknown vehicle type.") String type,
            @NotBlank @Size(max = 60) String company,
            @NotBlank @Size(max = 60) String model,
            @DecimalMin("3") @DecimalMax("120") Double mileage,
            @DecimalMin("0.5") @DecimalMax("150") Double battery,
            @Min(10) @Max(900) Integer range) {}

    private final VehicleService service;

    public VehicleController(VehicleService service) {
        this.service = service;
    }

    @GetMapping
    public List<VehicleDto> list(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        return service.list(userId).stream().map(VehicleDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VehicleDto create(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @Valid @RequestBody CreateRequest r) {
        return VehicleDto.of(service.create(userId, new VehicleService.Create(r.type(), r.company(), r.model(), r.mileage(), r.battery(), r.range())));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @PathVariable("id") String id) {
        service.delete(userId, parseId(id));
    }

    /** Accepts "veh-12" (what the front-end holds) or plain "12". */
    private static long parseId(String id) {
        try {
            return Long.parseLong(id.startsWith("veh-") ? id.substring(4) : id);
        } catch (NumberFormatException e) {
            throw com.ecoroute.common.ApiException.notFound("Vehicle not found.");
        }
    }
}
