#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const config = JSON.parse(fs.readFileSync(path.join(root, "config", "jurisdiction.generated.json"), "utf8"))
const sources = Object.fromEntries(config.source_registry.map((source) => [source.id, source]))

const rockaway = [
  "nyc_311_rockaway",
  "nyc_cooling_centers_rockaway",
  "nyc_hurricane_evacuation_centers_rockaway",
  "nypd_incidents_rockaway",
  "nycha_developments_rockaway",
]
for (const sourceId of rockaway) assert.ok(sources[sourceId], `missing Phase 3 Rockaway source: ${sourceId}`)
assert.equal(sources.nyc_311_rockaway.qualification, "qualified")
assert.equal(sources.nyc_cooling_centers_rockaway.qualification, "gated")
assert.match(sources.nyc_cooling_centers_rockaway.gate, /machine-readable/i)
for (const sourceId of rockaway.filter((id) => !["nyc_cooling_centers_rockaway", "nypd_incidents_rockaway"].includes(id))) {
  assert.equal(sources[sourceId].qualification, "qualified", `${sourceId} is not qualified`)
  assert.equal(sources[sourceId].enabled, true, `${sourceId} is not activated for Phase 4`)
}
assert.equal(sources.nypd_incidents_rockaway.qualification, "qualified")
assert.equal(sources.nypd_incidents_rockaway.enabled, false)
assert.match(sources.nypd_incidents_rockaway.gate, /historical/i)

for (const sourceId of ["coops_kings_point", "coops_montauk", "coops_battery_reference", "coops_sandy_hook_reference"]) {
  assert.equal(sources[sourceId].enabled, true)
  assert.equal(sources[sourceId].product, "water_level")
  assert.equal(sources[sourceId].datum, "MLLW")
}
for (const sourceId of ["usgs_massapequa_creek", "usgs_peconic_river", "usgs_rosedale_reference"]) {
  assert.equal(sources[sourceId].qualification, "qualified")
  assert.equal(sources[sourceId].window_hours, 12)
  assert.equal(sources[sourceId].enabled, true)
}
assert.equal(sources.nys_dec_active_sites.qualification, "qualified")
assert.equal(sources.nys_dec_active_sites.query_limit, 1000)
assert.equal(sources.nys_dec_active_sites.enabled, true)
assert.equal(sources.nyc_cb14_boundary.enabled, true)
assert.equal(sources.nys_civil_boundaries.enabled, true)
assert.equal(sources.nys_electric_utility_territories.enabled, true)

for (const sourceId of ["511ny_events", "mta_lirr_realtime", "mta_ace_realtime", "mta_lirr_alerts", "nyhops_reference"]) {
  assert.ok(sources[sourceId], `missing gated source: ${sourceId}`)
  assert.equal(sources[sourceId].enabled, false, `${sourceId} must remain gated`)
}

const serializedRegistry = JSON.stringify(config.source_registry)
assert.doesNotMatch(serializedRegistry, /"(?:api_key|app_token|password|secret)"\s*:/i, "source registry contains a credential field")

for (const fixture of [
  "phase-3-rockaway-normalization.json",
  "phase-3-rockaway-spatial-qualification.json",
  "phase-3-regional-geography.json",
  "phase-3-regional-observations.json",
]) {
  assert.equal(fs.existsSync(path.join(root, "fixtures", "long-island-sources", fixture)), true, `missing fixture: ${fixture}`)
}

console.log(`✓ Phase 3 contract gate valid: ${rockaway.length} Rockaway sources, 4 CO-OPS stations, 3 USGS sites, DEC and regional polygons`)
