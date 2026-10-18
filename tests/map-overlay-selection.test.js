import assert from "node:assert/strict"
import test from "node:test"
import { overlaySelection, visibleAddedLayers, participatingRegionalIds } from "../src/data/mapOverlaySelection.js"

test("aggregate covers empty, all, mixed and off without treating empty data as hidden", () => {
  assert.equal(overlaySelection([]), "Unavailable")
  assert.equal(overlaySelection([true, true]), "All")
  assert.equal(overlaySelection([true, false]), "Some")
  assert.equal(overlaySelection([false, false]), "Off")
})

test("hidden added layers remain loaded but cannot render or ground visible evidence", () => {
  const layers = {a:{id:"a",records:[],filterMode:"operational",visible:false},b:{id:"b",visible:true}}
  assert.deepEqual(visibleAddedLayers(layers).map(layer => layer.id), ["b"])
  assert.equal(layers.a.filterMode, "operational")
  assert.equal(Object.keys(layers).length, 2)
})


test("Phase 4 participates only after individual activation, independent of current visibility", () => {
  const ready = ["boundaries", "utilities", "nyc_311_rockaway"]
  assert.deepEqual(participatingRegionalIds(ready, []), [])
  assert.deepEqual(participatingRegionalIds(ready, ["utilities"]), ["utilities"])
  assert.deepEqual(participatingRegionalIds(["boundaries"], ["utilities"]), [])
})
