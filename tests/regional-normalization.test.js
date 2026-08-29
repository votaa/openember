import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { SOURCE_REGISTRY } from "../src/config/jurisdiction.js"
import { normalizeRockawayPayload } from "../src/data/regional/normalizeRockaway.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturePath = path.join(root, "fixtures", "long-island-sources", "phase-3-rockaway-normalization.json")
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
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

test("React and Streamlit normalize the shared Rockaway fixture identically", () => {
  const python = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "streamlit", "regional_normalization.py"), "--fixture", fixturePath],
    { encoding: "utf8" },
  ))
  assert.deepEqual(javascriptOutput(), python)
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
