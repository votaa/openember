import assert from "node:assert/strict"
import test from "node:test"

import {
  discoverArcGISLayers,
  fetchArcGISLayer,
  isQueryableArcGISServiceUrl,
  normalizeArcGISFeatures,
} from "../src/data/esriLayers.js"

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

test("recognizes queryable ArcGIS service URLs only", () => {
  assert.equal(isQueryableArcGISServiceUrl("https://example.com/arcgis/rest/services/LIRR/FeatureServer"), true)
  assert.equal(isQueryableArcGISServiceUrl("https://example.com/arcgis/rest/services/LIRR/MapServer/4"), true)
  assert.equal(isQueryableArcGISServiceUrl("https://www.arcgis.com/home/item.html?id=abc"), false)
  assert.equal(isQueryableArcGISServiceUrl("https://example.com/tiles/VectorTileServer"), false)
})

test("discovers a nonzero sublayer instead of assuming layer zero", async () => {
  const calls = []
  const layers = await discoverArcGISLayers("https://example.com/arcgis/rest/services/LIRR/FeatureServer", {
    fetchImpl: async url => {
      calls.push(url)
      return response({ layers: [{ id: 4, name: "LIRR Branches" }] })
    },
  })
  assert.equal(calls[0], "https://example.com/arcgis/rest/services/LIRR/FeatureServer?f=json")
  assert.deepEqual(layers.map(layer => ({id:layer.id,name:layer.name,url:layer.url})), [{
    id: 4,
    name: "LIRR Branches",
    url: "https://example.com/arcgis/rest/services/LIRR/FeatureServer/4",
  }])
})

test("loads GeoJSON with WGS84 output and a bounded record count", async () => {
  const calls = []
  const item = { id: "abc", title: "Rail", owner: "transit", url: "https://example.com/arcgis/rest/services/Rail/FeatureServer" }
  const layer = { id: 4, name: "Branches", url: `${item.url}/4` }
  const result = await fetchArcGISLayer(item, layer, { fetchImpl: async url => {
    calls.push(url)
    if (url.endsWith("?f=json")) return response({ name:"Branches", displayField:"NAME", capabilities:"Query" })
    return response({ type:"FeatureCollection", features:[{type:"Feature",properties:{NAME:"Montauk"},geometry:{type:"LineString",coordinates:[[-73,40],[-72,41]]}}] })
  } })
  const query = new URL(calls[1])
  assert.equal(query.searchParams.get("outSR"), "4326")
  assert.equal(query.searchParams.get("resultRecordCount"), "500")
  assert.equal(query.searchParams.get("f"), "geojson")
  assert.equal(result.records[0].geometry.type, "LineString")
  assert.equal(result.records[0].title, "Montauk")
  assert.equal(result.format, "geojson")
})

test("applies a server-side geography geometry before the 500-record cap", async () => {
  const calls = []
  const item = { id:"abc", title:"Assets", owner:"county", type:"Feature Layer", url:"https://example.com/arcgis/rest/services/Assets/FeatureServer" }
  const layer = { id:4, name:"Assets", url:`${item.url}/4` }
  await fetchArcGISLayer(item, layer, {
    geometry:{rings:[[[-74,40],[-73,40],[-73,41],[-74,40]]],spatialReference:{wkid:4326}},
    fetchImpl:async url => {
      calls.push(url)
      if (url.endsWith("?f=json")) return response({name:"Assets",capabilities:"Query"})
      return response({type:"FeatureCollection",features:[{type:"Feature",properties:{name:"Local"},geometry:{type:"Point",coordinates:[-73.5,40.5]}}]})
    },
  })
  const query = new URL(calls[1])
  assert.equal(query.searchParams.get("resultRecordCount"), "500")
  assert.equal(query.searchParams.get("geometryType"), "esriGeometryPolygon")
  assert.equal(query.searchParams.get("spatialRel"), "esriSpatialRelIntersects")
  assert.match(query.searchParams.get("geometry"), /spatialReference/)
})

test("falls back to ArcGIS JSON and normalizes point, path, and ring geometry", async () => {
  const item = { id:"xyz", title:"Operations", owner:"county" }
  const layer = { id:7, name:"Assets", url:"https://example.com/arcgis/rest/services/Ops/MapServer/7" }
  const calls = []
  const result = await fetchArcGISLayer(item, layer, { fetchImpl: async url => {
    calls.push(url)
    if (url.endsWith("?f=json")) return response({ name:"Assets", capabilities:"Map,Query,Data" })
    if (new URL(url).searchParams.get("f") === "geojson") return response({error:{message:"GeoJSON is not supported"}}, 400)
    return response({features:[
      {attributes:{Name:"Station"},geometry:{x:-73.1,y:40.7}},
      {attributes:{Name:"Route"},geometry:{paths:[[[-73,40],[-72,41]]]}},
      {attributes:{Name:"Zone"},geometry:{rings:[[[-73,40],[-72,40],[-72,41],[-73,40]]]}},
    ]})
  } })
  assert.deepEqual(result.records.map(record => record.geometry.type), ["Point", "LineString", "Polygon"])
  assert.equal(new URL(calls.at(-1)).searchParams.get("f"), "json")
  assert.equal(result.format, "arcgis-json")
})

test("drops unsupported geometry without discarding valid features", () => {
  const records = normalizeArcGISFeatures({features:[
    {attributes:{name:"valid"},geometry:{x:-73,y:40}},
    {attributes:{name:"unsupported"},geometry:{xmin:0,ymin:0,xmax:1,ymax:1}},
  ]}, {item:{id:"one",title:"Test"},layer:{id:2,name:"Test"},fetchedAt:"2026-08-30T00:00:00.000Z"})
  assert.equal(records.length, 1)
  assert.equal(records[0].title, "valid")
})
