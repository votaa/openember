# Frozen KB/upload replay with fixture weather and boundary timing; not current verification

## Facts

- Selected map location: North Shore University Hospital (source snapshot: Configured hospital listing). Facility footprint remains unverified.
- Supplied map geometry intersects these NYS administrative boundaries: County: Nassau. Source: NYS Civil Boundaries (https://gis.ny.gov/civil-boundaries). Full containment, facility ownership and emergency authority are not established.
- Latest reported; outside the current freshness window (4030 seconds old). KLGA (regional reference) at 2026-11-15T16:00:00Z: wind 22.21 km/h; gusts 33.34 km/h (quality S); wind direction 340 degrees. Source: https://api.weather.gov/stations/KLGA/observations/latest.

## Source-supported context

- --- Critical Infrastructure \[Local OEM\] --- lists North Shore University Hospital in its Nassau hospital section. The listing does not verify current designation, receiving capacity or access.
- --- Contacts &amp; Resources \[Local OEM\] --- lists Nassau OEM telephone 516-573-9600. Supplied geometry intersects Nassau County; this is a county coordination reference, not a finding of full containment, command assignment or authority. Verify the contact's current validity.

## Conditional considerations

- Confirm current facility capabilities, receiving status and access with the selected hospital. A regional list does not establish a current trauma designation, available capacity or a transport destination.
- Verify the listed county coordination contact and the incident-specific coordination arrangement. A county boundary intersection and contact listing do not appoint an incident commander or authorize procedures.
- For the selected hospital, verify patient access and the readiness of essential services with the facility. Nearby station wind does not establish on-site conditions, service disruption or receiving capacity.

## Material gaps

- KLGA is a nearby station reference (14.593–14.593 km to supplied geometry vertices). Nearby measurements do not establish on-site conditions or coverage between vertices.
- KLGA: the observation or source snapshot is stale. No other station was substituted.
- Only supported descriptive relations and bounded facts are represented. Other enabled source text remains available for review; missing extraction does not establish absence, safe conditions or normal operations.
