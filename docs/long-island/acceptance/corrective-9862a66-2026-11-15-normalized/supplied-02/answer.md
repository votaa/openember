Application-rendered evidence; source attribution does not independently verify source authority.

Requested interval: 2026-11-15T18:00:00-05:00 to 2026-11-16T06:00:00-05:00 (America/New\_York); method source\_period.

## Facts

- Source positive-plan.md states: “Incident commander: Casey Example”
- Source positive-plan.md states: “Cone specifications: Exercise model X”
- Source positive-plan.md states: “Cone ballast: 10 lb on each deployed cone”
- Source positive-plan.md states: “Cone placement: Gate A”
- Source positive-plan.md states: “Authorized radio use: Exercise command authorizes DELTA-19 for Gate A check-ins during this period”
- Source positive-plan.md states: “Inventory: 47 amber cones”
- Source positive-plan.md states: “Deployment: 12 amber cones deployed at Gate A for this exercise; remaining 35 in storage”
- Source positive-plan.md states: “Facility ID: CEDAR-731”
- Source positive-plan.md states: “Radio channel: DELTA-19”
- Source positive-plan.md states: “Command succession SOP: If Casey Example is unavailable, Exercise deputy Jordan Example assumes exercise command under this plan; verify that condition first”
- Forecast source: https://api.weather.gov/gridpoints/OKX/62,50/forecast/hourly; area Hourly Forecast; fetched 2026-11-15T14:39:49.858+00:00; coverage complete.
- Minimum in the supplied hourly forecast: 35 °F; selected interval 2026-11-15T23:00:00Z to 2026-11-16T11:00:00Z; coverage complete. This is not a published nighttime low or a full-window minimum when coverage is partial.
- Wind values in the supplied hourly forecast: 7 mph NW; 6 mph NW; 5 mph N. Precipitation probabilities in supplied periods: 1%. Coverage complete. See the original source for interval times; selected coverage is shown in application metadata.
- Forecast source: https://api.weather.gov/gridpoints/OKX/62,50; area Wind &amp; Precip Grid; fetched 2026-11-15T14:39:49.848+00:00; coverage field-specific; no full-window aggregate calculated.
- windSpeed (wmoUnit:km\_h-1): supplied interval values range 7.408 to 11.112; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- windGust (wmoUnit:km\_h-1): supplied interval values range 18.52 to 22.224; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- quantitativePrecipitation (wmoUnit:mm): supplied interval values range 0 to 0; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- probabilityOfPrecipitation (wmoUnit:percent): supplied interval values range 1 to 1; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- temperature (wmoUnit:degC): supplied interval values range 1.6666666666666667 to 6.111111111111111; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- minTemperature (wmoUnit:degC): supplied interval values range 0.5555555555555556 to 0.5555555555555556; field coverage partial; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- maxTemperature (wmoUnit:degC): supplied interval values range 10.555555555555555 to 10.555555555555555; field coverage partial; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- relativeHumidity (wmoUnit:percent): supplied interval values range 73 to 89; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- skyCover (wmoUnit:percent): supplied interval values range 7 to 45; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- weather (unknown units): no numeric values supplied; field coverage complete; null/non-numeric intervals 1. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- snowfallAmount (wmoUnit:mm): supplied interval values range 0 to 0; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- iceAccumulation (wmoUnit:mm): supplied interval values range 0 to 0; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- windDirection (wmoUnit:degree\_(angle)): supplied interval values range 320 to 340; field coverage complete; null/non-numeric intervals 0. This range is not an accumulated total or an observation. Source: https://api.weather.gov/gridpoints/OKX/62,50.
- Current background only, not a future forecast: Kings Point (LI Sound) at 2026-11-15T14:30:00Z; {"height":1.998} ft; datum MLLW. Source: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&amp;station=8516945&amp;product=water\_level&amp;datum=MLLW&amp;time\_zone=gmt&amp;units=english&amp;format=json&amp;application=EMBER.
- Current background only, not a future forecast: Sandy Hook (outer-harbor ref) at 2026-11-15T14:30:00Z; {"height":4.376} ft; datum MLLW. Source: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&amp;station=8531680&amp;product=water\_level&amp;datum=MLLW&amp;time\_zone=gmt&amp;units=english&amp;format=json&amp;application=EMBER.
- Battery Park (NYC surge ref) (8518750, reference): astronomical tide prediction {"height":0.952}; ft; datum MLLW; 2026-11-15T18:31:00-05:00 / 2026-11-15T23:31:00Z; quality prediction. Source: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=today&amp;range=48&amp;station=8518750&amp;product=predictions&amp;datum=MLLW&amp;time\_zone=gmt&amp;interval=hilo&amp;units=english&amp;format=json&amp;application=EMBER. Facility applicability: unknown.
- Source positive-plan.md states: “CEDAR-731: water\_level &gt;= 10 ft; datum MLLW; station 8518750.” Issuer: Exercise command; validity 2026-11-15T23:00:00Z to 2026-11-16T11:00:00Z; reference https://example.invalid/exercise-plan. This is an attributed source requirement, not independent confirmation of issuer authority.
- Source positive-plan.md states: “CEDAR-731: when conducting Gate A check-ins in this exercise period, Exercise command requires use DELTA-19 for those check-ins.” Issuer: Exercise command; validity 2026-11-15T23:00:00Z to 2026-11-16T11:00:00Z; reference https://example.invalid/exercise-plan. This is an attributed source requirement, not independent confirmation of issuer authority.

## Possible impacts

- Cone displacement is possible if cones are deployed, but stability cannot be assessed without applicable specifications, ballast and placement. The inventory count does not establish deployment or a wind action limit.

## Source references

- Source Enabled KB/context states: “=== LONG ISLAND EMERGENCY MANAGEMENT KNOWLEDGE BASE ===” Reference excerpt only; operational applicability is not established by this excerpt.
- Source positive-plan.md states: “Synthetic exercise evidence only. These values are fixtures, not operational guidance.” Reference excerpt only; operational applicability is not established by this excerpt.
- Source positive-plan.md states: “Facility ID: CEDAR-731 Incident commander: Casey Example Command succession SOP: If Casey Example is unavailable, Exercise deputy Jordan Example assumes exercise command under this plan; verify that condition first Inventory: 47 amber cones Deployment: 12 amber cones deployed at Gate A for this exercise; remaining 35 in storage Cone specifications: Exercise model X Cone ballast: 10 lb on each deployed cone Cone placement: Gate A Radio channel: DELTA-19 Authorized radio use: Exercise command authorizes DELTA-19 for Gate A check-ins during this period” Reference excerpt only; operational applicability is not established by this excerpt.

## Gaps

- positive-plan.md: no explicit labelled fields extracted for facility coordinates, assignment status. Consult the full source; extraction uncertainty does not establish absence.
- Battery Park (NYC surge ref): no eligible water\_level events for the requested window; state available.
- Kings Point (LI Sound): no eligible water\_level events for the requested window; state available.
- Montauk: no eligible water\_level events for the requested window; state available.
- Sandy Hook (outer-harbor ref): no eligible water\_level events for the requested window; state available.
- Battery Park (NYC surge ref): no eligible wind events for the requested window; state unavailable.
- Inventory does not establish deployment. Source omissions do not establish an absent commander. Verify actual deployment and assignment using the applicable plan.
- Facility-specific flood, utility and equipment-stability likelihoods are not established here. Tide predictions, precipitation probability and current alerts do not establish those likelihoods.

## Suggestions

- Verify the applicable equipment specifications, deployed inventory, current command assignment and authorized communications procedure before deciding on site actions.
