import assert from "node:assert/strict"
import test from "node:test"

import { mapFeatureChatPrompt, normalizeMapFeature } from "../src/data/mapInteraction.js"
import { buildCopilotSystemPrompt } from "../src/data/copilotPrompt.js"

test("normalizes map selections across legacy and regional field names", () => {
  assert.deepEqual(normalizeMapFeature({
    title: "LIRR Main Line",
    description: "Rail corridor",
    source_name: "LIRR branches",
    geometry_type: "LineString",
    observed_at: "2026-08-31T12:00:00Z",
  }), {
    title: "LIRR Main Line",
    name: "LIRR Main Line",
    description: "Rail corridor",
    sourceName: "LIRR branches",
    layerLabel: "LIRR branches",
    geometryType: "LineString",
    observedAt: "2026-08-31T12:00:00Z",
    fetchedAt: null,
    attribution: null,
    color: "#60a5fa",
  })
})

test("map selection does not create a chat prompt until explicitly requested", () => {
  const selected = normalizeMapFeature({ name: "Massapequa Creek", note: "Gauge height" })
  assert.equal(selected.title, "Massapequa Creek")
  assert.equal(mapFeatureChatPrompt(selected), "Tell me about emergency considerations for Massapequa Creek — Gauge height")
})

test("Montauk map prompt includes the feature description", () => {
  assert.equal(mapFeatureChatPrompt({
    name: "Montauk (peninsula tip)",
    description: "Zone VE — 3-sided water exposure; single road in/out (Route 27)",
  }), "Tell me about emergency considerations for Montauk (peninsula tip) — Zone VE — 3-sided water exposure; single road in/out (Route 27)")
})

test("Copilot system prompt is jurisdiction grounded and recognizes ESRI", () => {
  const prompt = buildCopilotSystemPrompt("Long Island", "configured context")
  assert.match(prompt, /an AI for Long Island emergency managers/)
  assert.match(prompt, /\[ESRI\]/)
  assert.match(prompt, /include only relevant emergency contacts/)
  assert.match(prompt, /do not attribute information to or include contacts for \[NYC OEM\]/)
  assert.doesNotMatch(prompt, /an AI for NYC emergency managers/)
})
