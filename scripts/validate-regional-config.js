#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const { load } = require("js-yaml")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const configPath = path.join(root, "config", "jurisdiction.yaml")
const generatedPath = path.join(root, "src", "config", "jurisdiction.js")
const generatedJsonPath = path.join(root, "config", "jurisdiction.generated.json")
const config = load(fs.readFileSync(configPath, "utf8"))
const generatedJson = JSON.parse(fs.readFileSync(generatedJsonPath, "utf8"))
const generated = await import(`${pathToFileURL(generatedPath).href}?validation=${Date.now()}`)

const expectedRegionIds = ["nassau", "suffolk", "rockaway"]
const allowedGeographies = new Set([...expectedRegionIds, "regional", "reference"])
const allowedQualifications = new Set([
  "qualified",
  "prototype_only",
  "access_required",
  "gated",
])
const allowedFailureStates = new Set(["stale", "unavailable", "access_required"])
const retiredCoopsStations = new Set(["8515186", "8515102"])

assert.deepEqual(Object.keys(config.regions).sort(), expectedRegionIds.sort())
assert.equal(config.regions.rockaway.boundary_filter.borough, "QUEENS")
assert.equal(config.regions.rockaway.boundary_filter.community_board, "14 QUEENS")
assert.equal(config.regions.rockaway.includes_broad_channel, true)

const regionFips = Object.values(config.regions).map((region) => region.county_fips)
assert.equal(new Set(regionFips).size, regionFips.length, "region county FIPS values must be unique")

const sources = config.source_registry
assert.ok(Array.isArray(sources) && sources.length > 0, "source_registry must not be empty")
assert.equal(new Set(sources.map((source) => source.id)).size, sources.length, "source ids must be unique")

for (const source of sources) {
  assert.ok(source.id && source.name && source.owner && source.endpoint, `incomplete source: ${source.id || "unknown"}`)
  assert.ok(allowedQualifications.has(source.qualification), `invalid qualification for ${source.id}`)
  assert.ok(allowedFailureStates.has(source.failure_state), `invalid failure_state for ${source.id}`)
  assert.equal(typeof source.enabled, "boolean", `enabled must be boolean for ${source.id}`)
  assert.ok(source.geographies.every((geography) => allowedGeographies.has(geography)), `invalid geography for ${source.id}`)

  if (["prototype_only", "access_required", "gated"].includes(source.qualification)) {
    assert.equal(source.enabled, false, `${source.id} must remain disabled while gated`)
  }
  if (!source.enabled) assert.ok(source.gate, `${source.id} must describe its enablement gate`)
}

const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]))
assert.deepEqual(
  sources.filter((source) => source.enabled).map((source) => source.id).sort(),
  [
    "coops_battery_reference",
    "coops_kings_point",
    "coops_montauk",
    "coops_sandy_hook_reference",
    "nyc_311_rockaway",
  ],
  "only already-supported, ungated Phase 2 sources may be enabled",
)
assert.equal(sourceById["511ny_events"].failure_state, "access_required")
assert.equal(sourceById["mta_lirr_realtime"].enabled, false)
assert.equal(sourceById["mta_ace_realtime"].enabled, false)
assert.equal(sourceById["mta_lirr_alerts"].enabled, false)
assert.match(sourceById["nyc_311_rockaway"].required_filter, /community_board = '14 QUEENS'/)
assert.equal(sourceById["nyc_hurricane_evacuation_centers_rockaway"].endpoint.endsWith("/p5md-weyf.json"), true)
assert.equal(sourceById["nypd_incidents_rockaway"].endpoint.endsWith("/5uac-w243.json"), true)
assert.equal(sourceById["nycha_developments_rockaway"].endpoint.endsWith("/phvi-damg.geojson"), true)
assert.equal(sourceById["nyc_cooling_centers_rockaway"].qualification, "gated")
assert.equal(sourceById["nypd_incidents_rockaway"].qualification, "gated")
assert.equal(sourceById["nycha_developments_rockaway"].qualification, "gated")

const configuredCoopsIds = new Set(config.coops_stations.map((station) => station.id))
for (const stationId of retiredCoopsStations) {
  assert.equal(configuredCoopsIds.has(stationId), false, `retired CO-OPS station ${stationId} is still configured`)
}
for (const stationId of ["8516945", "8510560", "8518750", "8531680"]) {
  assert.equal(configuredCoopsIds.has(stationId), true, `approved CO-OPS station ${stationId} is missing`)
}

assert.deepEqual(generated.REGIONS, config.regions, "generated React regions differ from YAML")
assert.deepEqual(generated.SOURCE_REGISTRY, sources, "generated React sources differ from YAML")
assert.deepEqual(generatedJson.source_registry, sources, "generated Streamlit sources differ from YAML")

console.log(`✓ regional config valid: ${expectedRegionIds.length} regions, ${sources.length} sources`)
