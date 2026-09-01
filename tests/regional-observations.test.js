import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { SOURCE_REGISTRY } from "../src/config/jurisdiction.js"
import { buildRegionalSourceUrl, normalizeRegionalPayload } from "../src/data/regional/regionalObservations.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturePath = path.join(root, "fixtures", "long-island-sources", "phase-3-regional-observations.json")
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
const sources = Object.fromEntries(SOURCE_REGISTRY.map((source) => [source.id, source]))

function javascriptOutput() {
  return Object.fromEntries(fixture.cases.map((fixtureCase) => [
    fixtureCase.source_id,
    normalizeRegionalPayload(
      sources[fixtureCase.source_id], fixtureCase.payload, fixture.fetched_at,
      fixture.evaluated_at, fixture.geography_records,
    ),
  ]))
}

test("React and Streamlit normalize NOAA, USGS, and DEC fixtures identically", () => {
  const python = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "regional_observations.py"), "--fixture", fixturePath],
    { encoding: "utf8" },
  ))
  assert.deepEqual(javascriptOutput(), python)
})

test("CO-OPS contracts preserve station roles, datum, quality, and latest observation", () => {
  const output = javascriptOutput()
  const kings = output.coops_kings_point.records[0]
  assert.equal(kings.observed_at, "2026-08-30T13:54:00.000Z")
  assert.equal(kings.properties.value, 1.15)
  assert.equal(kings.properties.datum, "MLLW")
  assert.equal(kings.properties.quality, "p")
  assert.equal(kings.properties.role, "primary")
  assert.equal(kings.geography, "regional")
  assert.equal(output.coops_montauk.records[0].geography, "suffolk")
  assert.equal(output.coops_battery_reference.records[0].geography, "reference")
  assert.equal(output.coops_sandy_hook_reference.records[0].properties.role, "reference")
})

test("USGS contracts keep only the latest approved site and parameter observation", () => {
  const output = javascriptOutput()
  const massapequa = output.usgs_massapequa_creek.records[0]
  assert.equal(massapequa.properties.source_record_id, "massapequa-latest")
  assert.equal(massapequa.properties.monitoring_location_id, "USGS-01309500")
  assert.equal(massapequa.properties.parameter_code, "00065")
  assert.equal(massapequa.properties.unit_of_measure, "ft")
  assert.equal(massapequa.status, "Provisional")
  assert.equal(output.usgs_rosedale_reference.records[0].geography, "reference")
})

test("DEC records require matching county attributes and authoritative polygons", () => {
  const result = javascriptOutput().nys_dec_active_sites
  assert.equal(result.data_state, "partial")
  assert.equal(result.rejected_count, 1)
  assert.deepEqual(result.records.map((record) => record.geography), ["nassau", "suffolk"])
  assert.equal(result.records[0].category, "State Superfund Program")
  assert.equal(result.records[0].properties.site_class, "02")
  assert.equal(result.records[0].disclaimer, "Provided as-is and subject to change without notice")
  assert.equal(result.records[0].source_url, "https://example.invalid/dec/130001")
})

test("query builders enforce bounded and source-specific request contracts", () => {
  const coops = new URL(buildRegionalSourceUrl(sources.coops_kings_point, { evaluatedAt: fixture.evaluated_at }))
  assert.equal(coops.searchParams.get("range"), "6")
  assert.equal(coops.searchParams.get("station"), "8516945")
  assert.equal(coops.searchParams.get("datum"), "MLLW")
  assert.equal(coops.searchParams.get("time_zone"), "gmt")

  const usgs = new URL(buildRegionalSourceUrl(sources.usgs_massapequa_creek, { evaluatedAt: fixture.evaluated_at }))
  assert.equal(usgs.searchParams.get("monitoring_location_id"), "USGS-01309500")
  assert.equal(usgs.searchParams.get("parameter_code"), "00065")
  assert.equal(usgs.searchParams.get("limit"), "100")
  assert.equal(usgs.searchParams.get("datetime"), "2026-08-30T02:00:00.000Z/2026-08-30T14:00:00.000Z")

  const dec = new URL(buildRegionalSourceUrl(sources.nys_dec_active_sites, { evaluatedAt: fixture.evaluated_at }))
  assert.equal(dec.pathname.endsWith("/MapServer/2/query"), true)
  assert.equal(dec.searchParams.get("where"), "COUNTY IN ('Nassau','Suffolk')")
  assert.equal(dec.searchParams.get("outSR"), "4326")
  assert.equal(dec.searchParams.get("resultRecordCount"), "1000")
})

test("stale, empty, malformed, and missing-mask states fail visibly", () => {
  const coopsCase = fixture.cases.find((item) => item.source_id === "coops_kings_point")
  const stale = normalizeRegionalPayload(
    sources.coops_kings_point, coopsCase.payload, fixture.fetched_at,
    "2026-08-30T14:14:00.001Z", fixture.geography_records,
  )
  assert.equal(stale.data_state, "stale")

  assert.equal(normalizeRegionalPayload(sources.coops_kings_point, { error: { message: "No data" } }, fixture.fetched_at).data_state, "unavailable")
  assert.equal(normalizeRegionalPayload(sources.usgs_massapequa_creek, { type: "FeatureCollection", features: [] }, fixture.fetched_at).data_state, "partial")
  assert.equal(normalizeRegionalPayload(sources.nys_dec_active_sites, { type: "FeatureCollection", features: [] }, fixture.fetched_at).data_state, "partial")

  const decCase = fixture.cases.find((item) => item.source_id === "nys_dec_active_sites")
  const missingMask = normalizeRegionalPayload(sources.nys_dec_active_sites, decCase.payload, fixture.fetched_at, fixture.evaluated_at)
  assert.equal(missingMask.data_state, "unavailable")
  assert.equal(missingMask.reason, "missing_spatial_mask")
})
