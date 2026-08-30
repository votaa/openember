#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const config = JSON.parse(fs.readFileSync(path.join(root, "config", "jurisdiction.generated.json"), "utf8"))
const sources = Object.fromEntries(config.source_registry.map(source => [source.id, source]))

const activeSourceIds = [
  "nyc_311_rockaway",
  "nyc_hurricane_evacuation_centers_rockaway",
  "nypd_incidents_rockaway",
  "nycha_developments_rockaway",
  "coops_kings_point",
  "coops_montauk",
  "coops_battery_reference",
  "coops_sandy_hook_reference",
  "usgs_massapequa_creek",
  "usgs_peconic_river",
  "usgs_rosedale_reference",
  "nys_dec_active_sites",
  "nyc_cb14_boundary",
  "nys_civil_boundaries",
  "nys_electric_utility_territories",
]

for (const sourceId of activeSourceIds) {
  const source = sources[sourceId]
  assert.ok(source, `missing Phase 4 source: ${sourceId}`)
  assert.equal(source.qualification, "qualified", `${sourceId} is not qualified`)
  assert.equal(source.enabled, true, `${sourceId} is not active`)
  assert.equal(source.display?.map_capable, true, `${sourceId} lacks a map display contract`)
  assert.ok(source.display.icon && source.display.color && source.display.kind, `${sourceId} has incomplete card metadata`)
}

assert.equal(sources.nyc_cooling_centers_rockaway.qualification, "gated")
assert.equal(sources.nyc_cooling_centers_rockaway.enabled, false)
assert.match(sources.nyc_cooling_centers_rockaway.gate, /machine-readable/i)

const reactSource = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8")
const streamlitSource = fs.readFileSync(path.join(root, "streamlit", "app.py"), "utf8")
for (const sourceText of [reactSource, streamlitSource]) {
  assert.match(sourceText, /phase4Source|phase4_source/)
  assert.match(sourceText, /Polygon/)
  assert.match(sourceText, /partial/)
  assert.match(sourceText, /unavailable/)
}

assert.equal(
  fs.existsSync(path.join(root, "fixtures", "long-island-sources", "phase-4-display.json")),
  true,
  "missing Phase 4 parity fixture",
)

console.log(`✓ Phase 4 display gate valid: ${activeSourceIds.length} active sources, cooling centers visibly gated`)
