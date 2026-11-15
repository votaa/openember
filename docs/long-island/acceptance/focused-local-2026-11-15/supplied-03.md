# Local deterministic projection: supplied-03

No model call; not hosted acceptance. Replays captured inputs at their original receipt time and selects all optional records (up to 24).

2026-11-15T18:00:00-05:00 to 2026-11-16T06:00:00-05:00 (America/New\_York; source\_period).

## Facts

- positive-plan.md — commander: Casey Example.
- positive-plan.md — cone specifications: Exercise model X.
- positive-plan.md — cone ballast: 10 lb on each deployed cone.
- positive-plan.md — cone placement: Gate A.
- positive-plan.md — inventory: 47 amber cones.
- positive-plan.md — deployment: 12 amber cones deployed at Gate A for this exercise; remaining 35 in storage.
- positive-plan.md — radio channel: DELTA-19.
- Minimum in the supplied hourly forecast: 35 °F; coverage complete. Not a published nighttime low.
- Supplied hourly wind: 7 mph NW; 6 mph NW; 5 mph N; precipitation probabilities: 1%. Coverage complete.
- gusts in supplied grid intervals: 18.52–22.22 km/h; coverage complete.  Source: https://api.weather.gov/gridpoints/OKX/62,50.
- positive-plan.md states: “CEDAR-731: when conducting Gate A check-ins in this exercise period, Exercise command requires use DELTA-19 for those check-ins.” Issuer: Exercise command; valid 2026-11-15T23:00:00Z–2026-11-16T11:00:00Z; https://example.invalid/exercise-plan.

## Possible impacts

- Cone displacement is possible if cones are deployed. A stability assessment needs a supported wind rating and applicable installation conditions; the forecast is not an equipment action limit.

## Gaps

- positive-plan.md: facility coordinates not extracted as labelled fields. Consult the full source; non-extraction is not absence.
- Facility location, exposure and vulnerability must be established before assigning a site-specific impact likelihood.

## Sources

- Forecast URL: https://api.weather.gov/gridpoints/OKX/62,50/forecast/hourly.
- Uploaded source: positive-plan.md. Full text is available under Request sources.
