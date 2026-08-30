import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { SOURCE_REGISTRY } from "../src/config/jurisdiction.js"
import { normalizeRockawayPayload } from "../src/data/regional/normalizeRockaway.js"
import {
  ROCKAWAY_SOURCE_IDS,
  buildRockawayQueryUrl,
  rockawaySourceCard,
  unavailableRockawayResult,
} from "../src/data/regional/rockawaySources.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturePath = path.join(root, "fixtures", "long-island-sources", "phase-3-rockaway-normalization.json")
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
const spatialFixturePath = path.join(root, "fixtures", "long-island-sources", "phase-3-rockaway-spatial-qualification.json")
const spatialFixture = JSON.parse(fs.readFileSync(spatialFixturePath, "utf8"))
const sources = Object.fromEntries(SOURCE_REGISTRY.map((source) => [source.id, source]))

function javascriptOutput() {
  return Object.fromEntries(fixture.cases.map((fixtureCase) => [
    fixtureCase.source_id,
    normalizeRockawayPayload(
      sources[fixtureCase.source_id],
      fixtureCase.rows,
      fixture.fetched_at,
      fixture.evaluated_at,
    ),
  ]))
}

function spatialJavascriptOutput() {
  return Object.fromEntries(spatialFixture.cases.map((fixtureCase) => [
    fixtureCase.source_id,
    normalizeRockawayPayload(
      sources[fixtureCase.source_id],
      fixtureCase.rows || fixtureCase.payload,
      spatialFixture.fetched_at,
      spatialFixture.evaluated_at,
      spatialFixture.geography_records,
    ),
  ]))
}

test("React and Streamlit normalize the shared Rockaway fixture identically", () => {
  const python = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "regional_normalization.py"), "--fixture", fixturePath],
    { encoding: "utf8" },
  ))
  assert.deepEqual(javascriptOutput(), python)
})

test("React and Streamlit spatially qualify NYPD, NYCHA, and evacuation-center records identically", () => {
  const python = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "regional_normalization.py"), "--fixture", spatialFixturePath],
    { encoding: "utf8" },
  ))
  const output = spatialJavascriptOutput()
  assert.deepEqual(output, python)
  assert.deepEqual(output.nypd_incidents_rockaway.records.map(record => record.properties.source_record_id), ["spatial-nypd-in"])
  assert.equal(output.nypd_incidents_rockaway.records[0].geometry.type, "Point")
  assert.equal(output.nypd_incidents_rockaway.records[0].observed_at, "2026-06-30T20:00:00")
  assert.deepEqual(output.nycha_developments_rockaway.records.map(record => record.title), ["HAMMEL"])
  assert.equal(output.nycha_developments_rockaway.records[0].geometry.type, "MultiPolygon")
  const evacuation = output.nyc_hurricane_evacuation_centers_rockaway
  assert.deepEqual(evacuation.records.map(record => record.title), ["IN-SCOPE EVACUATION CENTER FIXTURE"])
  assert.equal(evacuation.records[0].activation_state, "confirmation_required")
  assert.equal(evacuation.records[0].status, "Activation unconfirmed")
})

test("a healthy inventory with no CB14 facilities is not reported as zero active centers", () => {
  const fixtureCase = spatialFixture.cases.find(item => item.source_id === "nyc_hurricane_evacuation_centers_rockaway")
  const result = normalizeRockawayPayload(
    sources[fixtureCase.source_id],
    [fixtureCase.rows[1]],
    spatialFixture.fetched_at,
    spatialFixture.evaluated_at,
    spatialFixture.geography_records,
  )
  assert.equal(result.data_state, "partial")
  assert.equal(result.records.length, 0)
  assert.equal(result.reason, "no_local_reference_facilities")
  assert.equal(result.scope_state, "no_local_reference_facilities")
  assert.equal(result.activation_state, "confirmation_required")
})

test("an empty evacuation inventory remains distinct from an empty local scope", () => {
  const result = normalizeRockawayPayload(
    sources.nyc_hurricane_evacuation_centers_rockaway,
    [],
    spatialFixture.fetched_at,
    spatialFixture.evaluated_at,
    spatialFixture.geography_records,
  )
  assert.equal(result.reason, "empty_upstream_inventory")
  assert.equal(result.scope_state, "upstream_inventory_empty")
  assert.equal(result.activation_state, "confirmation_required")
})

test("malformed evacuation records cannot masquerade as no local facilities", () => {
  const result = normalizeRockawayPayload(
    sources.nyc_hurricane_evacuation_centers_rockaway,
    [{ bldg_name: "Missing geometry and identifier" }],
    spatialFixture.fetched_at,
    spatialFixture.evaluated_at,
    spatialFixture.geography_records,
  )
  assert.equal(result.data_state, "unavailable")
  assert.equal(result.reason, "malformed_records")
  assert.equal(result.scope_state, null)
})

test("spatial sources fail closed when the authoritative CB14 mask is missing", () => {
  for (const fixtureCase of spatialFixture.cases) {
    const result = normalizeRockawayPayload(
      sources[fixtureCase.source_id],
      fixtureCase.rows || fixtureCase.payload,
      spatialFixture.fetched_at,
      spatialFixture.evaluated_at,
    )
    assert.equal(result.data_state, "unavailable")
    assert.equal(result.reason, "missing_spatial_mask")
  }
})

test("out-of-scope rows make a response partial instead of a false current zero", () => {
  for (const result of Object.values(javascriptOutput())) {
    assert.equal(result.data_state, "partial")
    assert.equal(result.records.length, 1)
    assert.equal(result.rejected_count, 1)
    assert.equal(result.records[0].geography, "rockaway")
    assert.equal(result.records[0].data_state, "partial")
  }
})

test("empty and malformed payloads are not current zero-event responses", () => {
  const source = sources.nyc_311_rockaway
  assert.equal(normalizeRockawayPayload(source, [], fixture.fetched_at).data_state, "partial")
  assert.equal(normalizeRockawayPayload(source, {}, fixture.fetched_at).data_state, "unavailable")
})

test("stale evaluation overrides otherwise valid records", () => {
  const fixtureCase = fixture.cases[0]
  const result = normalizeRockawayPayload(
    sources[fixtureCase.source_id],
    [fixtureCase.rows[0]],
    fixture.fetched_at,
    "2026-08-29T18:00:00.000Z",
  )
  assert.equal(result.data_state, "stale")
  assert.equal(result.records[0].data_state, "stale")
})

test("React and Streamlit derive equivalent Phase 4 source cards", () => {
  const normalized = javascriptOutput()
  const javascriptCards = Object.fromEntries(ROCKAWAY_SOURCE_IDS.map(sourceId => {
    const source = sources[sourceId]
    return [sourceId, rockawaySourceCard(source, normalized[sourceId] || unavailableRockawayResult(source))]
  }))
  const pythonCards = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "regional_normalization.py"), "--fixture", fixturePath, "--cards"],
    { encoding: "utf8" },
  ))
  assert.deepEqual(javascriptCards, pythonCards)
  assert.equal(javascriptCards.nyc_311_rockaway.map_capable, true)
  assert.equal(javascriptCards.nyc_hurricane_evacuation_centers_rockaway.activation_state, "confirmation_required")
  assert.equal(javascriptCards.nyc_hurricane_evacuation_centers_rockaway.confirmation_phone, "311")
  assert.equal(javascriptCards.nypd_incidents_rockaway.data_state, "unavailable")
})

test("bounded source queries carry their approved filter and limit", () => {
  for (const sourceId of ["nyc_311_rockaway", "nyc_hurricane_evacuation_centers_rockaway", "nypd_incidents_rockaway", "nycha_developments_rockaway"]) {
    const source = sources[sourceId]
    const url = new URL(buildRockawayQueryUrl(source))
    assert.equal(url.searchParams.get("$where"), source.required_filter)
    assert.equal(url.searchParams.get("$limit"), String(source.query_limit))
    if (source.query_order) assert.equal(url.searchParams.get("$order"), source.query_order)
  }
})
