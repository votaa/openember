# Local synthetic fixture replay

## Facts

- Selected map location: Example Hospital (source snapshot: Map layer). Local jurisdiction and facility footprint are unresolved.
- Latest reported; outside the current freshness window (4030 seconds old). KFRG (Long Island station) at 2026-11-15T16:00:00Z: wind 22.21 km/h; gusts 33.34 km/h (quality S); wind direction 340 degrees. Source: https://api.weather.gov/stations/KFRG/observations/latest.

## Source-supported context

- first.txt states: “Example Hospital has backup power.” This is an attributed source assertion; current status and independent site applicability are unverified.
- second.txt states: “Example Hospital does not have backup power.” This is an attributed source assertion; current status and independent site applicability are unverified.

## Conditional considerations

- For the selected hospital, verify patient access and the readiness of essential services with the facility. Nearby station wind does not establish on-site conditions, service disruption or receiving capacity.

## Material gaps

- Supplied sources conflict about backup power at Example Hospital. Both assertions are retained; no precedence or current status is established.
- KFRG is a nearby station reference (10.742–10.742 km to supplied geometry vertices). Nearby measurements do not establish on-site conditions or coverage between vertices.
- KFRG: the observation or source snapshot is stale. No other station was substituted.
- Only supported descriptive relations and bounded facts are represented. Other enabled source text remains available for review; missing extraction does not establish absence, safe conditions or normal operations.
