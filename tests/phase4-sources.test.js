import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { SOURCE_REGISTRY } from "../src/config/jurisdiction.js"
import {
  PHASE4_GEOGRAPHY_SOURCE_IDS,
  fetchPhase4SourceBundle,
  phase4SourceCard,
} from "../src/data/regional/phase4Sources.js"
import { fetchRockawaySource } from "../src/data/regional/rockawaySources.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixtureDir = path.join(root, "fixtures", "long-island-sources")
const displayFixturePath = path.join(fixtureDir, "phase-4-display.json")
const displayFixture = JSON.parse(fs.readFileSync(displayFixturePath, "utf8"))
const sources = Object.fromEntries(SOURCE_REGISTRY.map(source => [source.id, source]))

function casesBySource(filename) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, filename), "utf8"))
  return Object.fromEntries(fixture.cases.map(item => [item.source_id, item.payload || item.rows]))
}

const payloads = {
  ...casesBySource("phase-3-regional-geography.json"),
  ...casesBySource("phase-3-rockaway-spatial-qualification.json"),
  ...casesBySource("phase-3-rockaway-normalization.json"),
  ...casesBySource("phase-3-regional-observations.json"),
}
const spatialFixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "phase-3-rockaway-spatial-qualification.json"), "utf8"))
const observationFixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "phase-3-regional-observations.json"), "utf8"))
payloads.nyc_cb14_boundary = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { OBJECTID: 414, BoroCD: 414 },
    geometry: spatialFixture.geography_records[0].geometry,
  }],
}
const countyProperties = {
  nassau: { OBJECTID: 59, NAME: "Nassau", FIPS_CODE: "36059", NYC: "N", DATEMOD: "2025-01-01T00:00:00Z" },
  suffolk: { OBJECTID: 103, NAME: "Suffolk", FIPS_CODE: "36103", NYC: "N", DATEMOD: "2025-01-01T00:00:00Z" },
  queens: { OBJECTID: 81, NAME: "Queens", FIPS_CODE: "36081", NYC: "Y", DATEMOD: "2025-01-01T00:00:00Z" },
}
const observationCountyMasks = Object.fromEntries(observationFixture.geography_records.map(record => [record.scope_key, record.geometry]))
payloads.nys_civil_boundaries = {
  type: "FeatureCollection",
  features: ["nassau", "suffolk", "queens"].map(scopeKey => ({
    type: "Feature",
    properties: countyProperties[scopeKey],
    geometry: observationCountyMasks[scopeKey] || observationCountyMasks.nassau,
  })),
}

function sourceIdForUrl(rawUrl) {
  const url = new URL(rawUrl)
  if (url.hostname.includes("tidesandcurrents.noaa.gov")) {
    return SOURCE_REGISTRY.find(source => source.station_id === url.searchParams.get("station"))?.id
  }
  if (url.hostname.includes("waterdata.usgs.gov")) {
    return SOURCE_REGISTRY.find(source => source.monitoring_location_id === url.searchParams.get("monitoring_location_id"))?.id
  }
  return SOURCE_REGISTRY.find(source => rawUrl.startsWith(source.endpoint))?.id
}

test("React and Streamlit derive identical Phase 4 cards", () => {
  const javascriptCards = Object.fromEntries(Object.entries(displayFixture.results).map(([sourceId, result]) => [
    sourceId,
    phase4SourceCard(sources[sourceId], result),
  ]))
  const pythonCards = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "phase4_sources.py"), "--cards", displayFixturePath],
    { encoding: "utf8" },
  ))
  assert.deepEqual(javascriptCards, pythonCards)
  assert.equal(javascriptCards.nyc_311_rockaway.map_capable, true)
  assert.equal(javascriptCards.nyc_cooling_centers_rockaway.data_state, "unavailable")
  assert.equal(javascriptCards.nyc_hurricane_evacuation_centers_rockaway.activation_state, "confirmation_required")
  assert.equal(javascriptCards.nys_dec_active_sites.rejected_count, 1)
  assert.equal(javascriptCards.nys_civil_boundaries.map_count, 1)
})

test("Phase 4 orchestration fetches authoritative masks before dependent sources", async () => {
  const calls = []
  const fakeFetch = async rawUrl => {
    const sourceId = sourceIdForUrl(rawUrl)
    calls.push(sourceId)
    const payload = payloads[sourceId]
    assert.ok(payload, `missing fake payload for ${sourceId}`)
    return { ok: true, json: async () => payload }
  }
  const bundle = await fetchPhase4SourceBundle(SOURCE_REGISTRY, {
    fetchImpl: fakeFetch,
    fetchedAt: "2026-08-30T14:00:00.000Z",
    evaluatedAt: "2026-08-30T14:00:00.000Z",
  })

  assert.deepEqual(new Set(calls.slice(0, 3)), new Set(PHASE4_GEOGRAPHY_SOURCE_IDS))
  assert.equal("nypd_incidents_rockaway" in bundle.results, false)
  assert.equal(bundle.results.nycha_developments_rockaway.records.length, 1)
  assert.equal(bundle.results.nyc_hurricane_evacuation_centers_rockaway.activation_state, "confirmation_required")
  assert.equal(bundle.results.nys_dec_active_sites.data_state, "partial")
  assert.equal(bundle.geography_records.length > 0, true)
})

test("Socrata timeout retries with app token and succeeds on the third attempt", async () => {
  const source = sources.nyc_311_rockaway
  const attempts = []
  const fakeFetch = async (_url, options) => {
    attempts.push(options)
    if (attempts.length < 3) {
      const error = new Error("timed out")
      error.name = "TimeoutError"
      throw error
    }
    return { ok: true, json: async () => payloads.nyc_311_rockaway }
  }
  const result = await fetchRockawaySource(source, {
    fetchImpl: fakeFetch,
    fetchedAt: "2026-08-30T14:00:00.000Z",
    appToken: "test-token",
    sleepImpl: async () => {},
  })

  assert.equal(attempts.length, 3)
  assert.equal(attempts.every(options => options.headers["X-App-Token"] === "test-token"), true)
  assert.equal(result.records.length > 0, true)
  assert.notEqual(result.data_state, "unavailable")
})

test("Socrata retries HTTP 429 and 5xx responses", async () => {
  const statuses = [429, 503, 200]
  const result = await fetchRockawaySource(sources.nyc_311_rockaway, {
    fetchImpl: async () => {
      const status = statuses.shift()
      return {
        ok: status === 200,
        status,
        json: async () => payloads.nyc_311_rockaway,
      }
    },
    sleepImpl: async () => {},
  })

  assert.equal(statuses.length, 0)
  assert.equal(result.records.length > 0, true)
})

test("Socrata does not retry non-transient 4xx responses", async () => {
  let calls = 0
  const result = await fetchRockawaySource(sources.nyc_311_rockaway, {
    fetchImpl: async () => {
      calls += 1
      return { ok: false, status: 400 }
    },
    sleepImpl: async () => {},
  })

  assert.equal(calls, 1)
  assert.equal(result.data_state, "unavailable")
  assert.deepEqual(result.records, [])
})

test("failed Socrata refresh preserves 500 last-good records as stale", async () => {
  const source = sources.nyc_311_rockaway
  const previousResult = {
    records: Array.from({ length: 500 }, (_, index) => ({
      source_id: source.id,
      fetched_at: "2026-08-30T13:00:00.000Z",
      data_state: "current",
      geometry: { type: "Point", coordinates: [-73.8, 40.6] },
      properties: { source_record_id: String(index) },
    })),
    data_state: "current",
    reason: null,
    rejected_count: 0,
    fetched_at: "2026-08-30T13:00:00.000Z",
  }
  const result = await fetchRockawaySource(source, {
    fetchImpl: async () => {
      const error = new Error("timed out")
      error.name = "TimeoutError"
      throw error
    },
    previousResult,
    maxRetries: 0,
  })

  assert.equal(result.data_state, "stale")
  assert.equal(result.records.length, 500)
  assert.equal(result.records.every(record => record.data_state === "stale"), true)
  assert.equal(result.fetched_at, previousResult.fetched_at)
  assert.match(result.reason, /timed out/i)
})

test("successful Socrata results are cached for the configured refresh period", async () => {
  const source = sources.nyc_311_rockaway
  const cache = new Map()
  let calls = 0
  const fakeFetch = async () => {
    calls += 1
    return { ok: true, json: async () => payloads.nyc_311_rockaway }
  }
  await fetchPhase4SourceBundle([source], {
    fetchImpl: fakeFetch,
    fetchedAt: "2026-08-30T14:00:00.000Z",
    cache,
    nowMs: 1000,
  })
  await fetchPhase4SourceBundle([source], {
    fetchImpl: fakeFetch,
    fetchedAt: "2026-08-30T14:01:00.000Z",
    cache,
    nowMs: 61000,
  })

  assert.equal(calls, 1)
})

test("activated Phase 4 sources retain a visible display contract", () => {
  for (const source of SOURCE_REGISTRY.filter(item => item.enabled && (
    item.normalization || item.spatial || ["noaa_coops", "usgs_ogc", "arcgis_map_server"].includes(item.family)
  ))) {
    assert.equal(source.display?.map_capable, true, `${source.id} is not map-capable`)
    assert.ok(source.display.icon)
    assert.ok(source.display.color)
    assert.ok(source.display.kind)
  }
})
