# Local synthetic fixture replay

## Facts

- Selected map location: Example Hospital (source snapshot: Map layer). Local jurisdiction and facility footprint are unresolved.
- Latest reported; outside the current freshness window (4030 seconds old). KFRG (Long Island station) at 2026-11-15T16:00:00Z: wind 22.21 km/h; gusts 33.34 km/h (quality S); wind direction 340 degrees. Source: https://api.weather.gov/stations/KFRG/observations/latest.

## Source-supported context

- --- Critical Infrastructure \[Local OEM\] --- states: “Example Hospital has an emergency department.” This is an attributed source assertion; current status and independent site applicability are unverified.
- --- Critical Infrastructure \[Local OEM\] --- states: “Example Hospital has a single access road.” This is an attributed source assertion; current status and independent site applicability are unverified.

## Conditional considerations

- Verify current receiving capability and access with the facility; the listing does not establish capacity, trauma designation or a destination ranking.
- Verify access redundancy and current road conditions; the described access arrangement does not establish a closure or an evacuation route.
- For the selected hospital, verify patient access and the readiness of essential services with the facility. Nearby station wind does not establish on-site conditions, service disruption or receiving capacity.

## Material gaps

- KFRG is a nearby station reference (10.742–10.742 km to supplied geometry vertices). Nearby measurements do not establish on-site conditions or coverage between vertices.
- KFRG: the observation or source snapshot is stale. No other station was substituted.
- Only supported descriptive relations and bounded facts are represented. Other enabled source text remains available for review; missing extraction does not establish absence, safe conditions or normal operations.
