import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  MAP_BUILDER_FILTER_MODES,
  evaluateMapBuilderFilter,
} from "../src/data/mapBuilderFilters.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturePath = path.join(root, "fixtures", "long-island-sources", "map-builder-filter-parity.json")
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))

function javascriptOutput() {
  return Object.fromEntries(fixture.entry_paths.map(entryPath => [entryPath,
    Object.fromEntries(Object.values(MAP_BUILDER_FILTER_MODES).map(filterMode => {
      const result = evaluateMapBuilderFilter({
        type:"Feature Layer",
        sourceType:"Feature Layer",
        url:"https://example.test/FeatureServer/0",
        entryPath,
        filterMode,
        records:fixture.features,
      }, fixture.geography_records)
      return [filterMode, result.records.map(feature => feature.id)]
    })),
  ]))
}

test("search, quick-add, and pasted URL paths share the expected geography results", () => {
  const output = javascriptOutput()
  for (const entryPath of fixture.entry_paths) assert.deepEqual(output[entryPath], fixture.expected)
})

test("React and Streamlit Map Builder filters match the shared fixture", () => {
  const python = JSON.parse(execFileSync(
    "python3",
    [path.join(root, "tests", "map_builder_filter_fixture.py"), fixturePath],
    { encoding:"utf8" },
  ))
  assert.deepEqual(javascriptOutput(), python)
})

test("unsupported layers remain explicitly unfiltered", () => {
  const result = evaluateMapBuilderFilter({
    type:"Map Service",
    sourceType:"Map Service",
    url:"https://example.test/MapServer",
    filterMode:MAP_BUILDER_FILTER_MODES.OPERATIONAL,
    records:fixture.features,
  }, fixture.geography_records)
  assert.equal(result.supported, false)
  assert.equal(result.effectiveMode, MAP_BUILDER_FILTER_MODES.UNFILTERED)
  assert.equal(result.reason, "unsupported_layer_type")
  assert.equal(result.outputCount, fixture.features.length)
})

test("missing masks disclose an unfiltered fallback", () => {
  const result = evaluateMapBuilderFilter({
    type:"Feature Layer",
    sourceType:"Feature Layer",
    url:"https://example.test/FeatureServer/0",
    filterMode:MAP_BUILDER_FILTER_MODES.PSEG_LONG_ISLAND,
    records:fixture.features,
  }, [])
  assert.equal(result.effectiveMode, MAP_BUILDER_FILTER_MODES.UNFILTERED)
  assert.equal(result.reason, "missing_geography_masks")
})
