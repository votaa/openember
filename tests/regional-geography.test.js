import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { SOURCE_REGISTRY } from "../src/config/jurisdiction.js"
import {
  GEOGRAPHY_FILTER_MODES,
  buildGeographyQueryUrl,
  filterFeaturesByMode,
  geometryIntersectsMask,
  normalizeGeographyPayload,
  pointInPolygon,
  polygonsIntersect,
  validPolygonGeometry,
} from "../src/data/regional/regionalGeography.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturePath = path.join(root, "fixtures", "long-island-sources", "phase-3-regional-geography.json")
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
const sources = Object.fromEntries(SOURCE_REGISTRY.map((source) => [source.id, source]))

function javascriptOutput() {
  return Object.fromEntries(fixture.cases.map((fixtureCase) => [
    fixtureCase.source_id,
    normalizeGeographyPayload(
      sources[fixtureCase.source_id],
      fixtureCase.payload,
      fixture.fetched_at,
      fixture.evaluated_at,
    ),
  ]))
}

function geographyRecords() {
  return Object.values(javascriptOutput()).flatMap((result) => result.records)
}

test("React and Streamlit normalize the shared geography fixture identically", () => {
  const python = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "regional_geography.py"), "--fixture", fixturePath],
    { encoding: "utf8" },
  ))
  assert.deepEqual(javascriptOutput(), python)
})

test("authoritative geography contracts produce the expected masks", () => {
  const output = javascriptOutput()
  assert.equal(output.nyc_cb14_boundary.data_state, "current")
  assert.deepEqual(output.nys_civil_boundaries.records.map((record) => record.scope_key).sort(), ["nassau", "queens", "suffolk"])
  assert.deepEqual(output.nys_electric_utility_territories.records.map((record) => record.scope_key).sort(), [
    "municipal_fishers_island",
    "municipal_freeport",
    "municipal_greenport",
    "municipal_rockville_centre",
    "pseg_long_island",
  ])
  assert.equal(output.nys_electric_utility_territories.records[0].properties.comp_id, "2066")
})

test("query builders constrain official ArcGIS and Socrata geometry sources", () => {
  const cb14 = new URL(buildGeographyQueryUrl(sources.nyc_cb14_boundary))
  assert.equal(cb14.pathname.endsWith("/FeatureServer/0/query"), true)
  assert.equal(cb14.searchParams.get("where"), "BoroCD = 414")
  assert.equal(cb14.searchParams.get("outSR"), "4326")
  assert.equal(cb14.searchParams.get("f"), "geojson")

  const counties = new URL(buildGeographyQueryUrl(sources.nys_civil_boundaries))
  assert.match(counties.searchParams.get("where"), /36059/)
  assert.match(counties.searchParams.get("where"), /36103/)
  assert.match(counties.searchParams.get("where"), /36081/)

  const utilities = new URL(buildGeographyQueryUrl(sources.nys_electric_utility_territories))
  assert.match(utilities.searchParams.get("$where"), /Long Island|LIPA/)
  assert.match(utilities.searchParams.get("$where"), /FREEPORT/)
  assert.equal(utilities.searchParams.get("$limit"), "10")
})

test("operational mode retains municipal assets while PSEG mode excludes them", () => {
  const features = [
    { type: "Feature", properties: { name: "Nassau PSEG" }, geometry: { type: "Point", coordinates: [5, 5] } },
    { type: "Feature", properties: { name: "Freeport municipal" }, geometry: { type: "Point", coordinates: [1.5, 1.5] } },
    { type: "Feature", properties: { name: "Rockaway" }, geometry: { type: "Point", coordinates: [-1, 1] } },
    { type: "Feature", properties: { name: "Broad Channel" }, geometry: { type: "Point", coordinates: [-2.5, 4.5] } },
    { type: "Feature", properties: { name: "Queens outside CB14" }, geometry: { type: "Point", coordinates: [-5, 5] } },
    { type: "Feature", properties: { name: "Outside" }, geometry: { type: "Point", coordinates: [25, 5] } },
  ]
  const records = geographyRecords()
  assert.deepEqual(
    filterFeaturesByMode(features, records, GEOGRAPHY_FILTER_MODES.OPERATIONAL).map((feature) => feature.properties.name),
    ["Nassau PSEG", "Freeport municipal", "Rockaway", "Broad Channel"],
  )
  assert.deepEqual(
    filterFeaturesByMode(features, records, GEOGRAPHY_FILTER_MODES.PSEG_LONG_ISLAND).map((feature) => feature.properties.name),
    ["Nassau PSEG", "Rockaway"],
  )
})

test("point, line, and polygon predicates respect holes and disconnected polygons", () => {
  const pseg = geographyRecords().find((record) => record.scope_key === "pseg_long_island").geometry
  assert.equal(validPolygonGeometry(pseg), true)
  assert.equal(pointInPolygon([5, 5], pseg), true)
  assert.equal(pointInPolygon([1.5, 1.5], pseg), false)
  assert.equal(geometryIntersectsMask({ type: "LineString", coordinates: [[-5, 1], [1, 1]] }, pseg), true)
  assert.equal(polygonsIntersect({ type: "Polygon", coordinates: [[[1.2, 1.2], [1.8, 1.2], [1.8, 1.8], [1.2, 1.8], [1.2, 1.2]]] }, pseg), false)
  assert.equal(polygonsIntersect({ type: "Polygon", coordinates: [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] }, pseg), true)
})

test("missing, malformed, rejected, and stale boundary results remain explicit", () => {
  const source = sources.nys_civil_boundaries
  assert.equal(normalizeGeographyPayload(source, {}, fixture.fetched_at).data_state, "unavailable")
  assert.equal(normalizeGeographyPayload(source, { type: "FeatureCollection", features: [] }, fixture.fetched_at).data_state, "partial")

  const missing = structuredClone(fixture.cases.find((item) => item.source_id === source.id).payload)
  missing.features.pop()
  const missingResult = normalizeGeographyPayload(source, missing, fixture.fetched_at)
  assert.equal(missingResult.data_state, "partial")
  assert.deepEqual(missingResult.missing_scope_keys, ["queens"])

  const malformed = structuredClone(fixture.cases.find((item) => item.source_id === source.id).payload)
  malformed.features[0].geometry.coordinates[0].pop()
  assert.equal(normalizeGeographyPayload(source, malformed, fixture.fetched_at).reason, "features_rejected")

  const stale = normalizeGeographyPayload(source, fixture.cases[1].payload, fixture.fetched_at, "2026-10-01T00:00:00.000Z")
  assert.equal(stale.data_state, "stale")
})
