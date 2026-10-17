# Feature Request: Ground Chat in Loaded Map Layer Data

Status: implemented locally; deployment acceptance pending

Requested: 2026-10-17

## User need

When an operator loads a queryable ArcGIS / Living Atlas layer onto either OpenEmber map, chat should know which layer is active and be able to answer questions about its records, geography, and attributes. For example: “How many Fire/EMS stations are in the PSEG Long Island territory?” and “Summarize the loaded flood-risk features by county.” The answer must identify the source, filter, unit being counted, and whether the result covers the full matching inventory.

## Confirmed behavior before implementation

- **React/Vercel:** Living Atlas quick-adds, pasted Feature Services, and search-result map actions populate `esriMapLayers`. Chat context includes only `esriItems`, which is populated separately by the search-result “Add to KB” action. That action adds catalog metadata, not the loaded records or current map filter. The live Vercel map displayed 366 PSEG-filtered Fire/EMS features while chat said its KB had no count.
- **Streamlit:** The deployed preview's Map Builder quick-add loaded the Fire/EMS layer into its active layer list. The ESRI KB list remained empty. `build_context()` receives `esri_items`, while operational map layers are stored in `map_layers` and Map Builder layers in `mb_layers`. The Map Builder's client-side filtered count is displayed inside its iframe and is not supplied to Python chat context.
- Both runtimes keep a separate search-result “Add to KB” action for item metadata. Loading a layer onto a map does not make its feature data available to chat.

## Proposed behavior

### Shared layer contract

- Treat each active, queryable map layer as a chat-available data source automatically, regardless of whether it was added by search, a curated quick-add, or a pasted service URL. Cover both the operational map and Streamlit Map Builder.
- Use the same layer identity, sublayer URL, source attribution, active geography filter, and enabled/removed state for the map and chat. Keep catalog metadata and loaded feature data distinguishable in the UI and context.
- Refresh chat grounding when a layer is added, removed, filtered, hidden if visibility controls availability, or refreshed. Never describe a removed or failed layer as current.
- Show operators which loaded layers are available to chat, their active filters, fetch time, and data state. An unavailable query must remain unavailable rather than silently falling back to unfiltered geography.

### Counts and summaries

- Answer exact aggregate questions with deterministic ArcGIS queries over the complete matching inventory, using the same effective geography and attribute filters as the map. Use count or paginated/ID-based queries as appropriate; do not infer totals from the map's first 500 features or from an LLM estimate.
- State the counted unit explicitly: features, stations, facilities, or distinct organizations/departments. The Fire/EMS preset contains station/EMS features; its feature count must not be presented as a count of distinct fire departments unless a validated department identifier and deduplication rule support that claim.
- Support bounded summaries of selected fields, categories, and examples from loaded records. Use source field definitions and coded-value labels where available. Cite the layer name, service URL or item, filter, result scope, and fetch time.
- Distinguish complete totals from displayed subsets, partial results, unsupported aggregation, stale data, and failed queries. A valid zero is distinct from unavailable data.
- Keep LLM context bounded: provide verified metadata and deterministic aggregate results, with a small cited sample only when useful. Do not inject every map feature into the prompt.

### Scope and safety

- Start with public queryable ArcGIS Feature Layers. Non-queryable Map Services, imagery, vector tiles, or layers requiring unavailable credentials should show their metadata and an explicit “feature analysis unavailable” state.
- Preserve current map rendering and selection workflows. Apply geography constraints at the source query before any browse cap. Do not broaden a failed PSEG or operational-geography filter.
- Keep React/Vercel and Streamlit answer semantics and visible status labels aligned, including Streamlit's separate operational map and Map Builder paths.

## Acceptance criteria

1. Adding the Fire/EMS quick-add to each app makes that loaded layer visible as chat-available without a separate search-result “Add to KB” action.
2. A question about the PSEG-filtered Fire/EMS layer returns a source-backed **station/feature** count from the full matching inventory, or explicitly reports why a complete count is unavailable. It never calls the map feature count a department count.
3. Changing the geography filter changes the chat count and summary to the same effective scope; failed filters do not expose national or unfiltered totals as local results.
4. Search-added and pasted queryable layers follow the same behavior. Removing a layer removes its data from subsequent chat grounding; metadata intentionally saved in the KB is labeled separately.
5. Streamlit's operational-map layers and Map Builder layers both participate. Map Builder counts are available to Python chat logic, not only the embedded map iframe.
6. UI and responses distinguish catalog metadata, loaded records, displayed subset, complete aggregate, and unavailable/partial states, with source and fetch time.
7. Cross-runtime tests cover add, filter, refresh, remove, full-inventory count, browse cap, distinct-entity ambiguity, valid zero, and upstream failure. Browser checks verify the visible layer/KB status and a grounded chat answer in both deployments.

## Implementation direction for review

Define a shared normalized layer snapshot and query contract per runtime, then derive map presentation and chat evidence from that state. Add deterministic, geometry-scoped aggregate queries with completeness checks. Keep the existing catalog-metadata “Add to KB” control for item descriptions, but label it so operators do not mistake it for loading the layer's records.

Implementation was authorized on 2026-10-17. Deployment and publication are separate follow-up work.


## Local implementation (2026-10-17)

- React `src/data/mapLayerEvidence.js` and Streamlit `streamlit/map_layer_evidence.py` use the same evidence contract: layer ID/name/URL, filter, `where`, counted unit, fetch time, verified `complete_count`, displayed subset (when known), bounded examples, and summary state. Chat receives active layers automatically; an empty current-layer list explicitly supersedes earlier chat claims.
- Counts use `returnCountOnly=true` without a browse limit. Geography uses the same WGS84 polygon/intersects parameters as the map, sent upstream before any cap. Missing, stale, or partial geography cannot become an unfiltered count. HTTP-200 ArcGIS errors and malformed counts remain unavailable; zero is a valid complete count.
- Category questions match source field names/aliases (including county/category/status/type) and query one matched field with server-side grouped counts. At most 50 groups are supplied. A transfer-limit flag, malformed group, or sum that differs from the independent count withholds the summary. Unsupported/unmatched fields are explicit; this is not arbitrary SQL or distinct-organization analysis.
- Context includes at most three examples with eight attributes each, bounded values, and source aliases/coded-value labels. Examples are never inventory totals. Source metadata in the KB is labeled separately from loaded map evidence.
- React refreshes evidence on layer/filter changes, offers a manual evidence refresh, and queries current evidence again for each question. Filter requests reject superseded responses and do not resurrect a removed layer. Failed map refreshes retain the prior map browse with an explicit failure label; chat counts remain unavailable.
- Streamlit gathers operational-map and visible Map Builder layers directly from Python session state. Query evidence has a 60-second cache, keyed by the layer state, masks, and question; manual refresh clears it. Filter/visibility changes trigger reruns. The Map Builder iframe hides filtered layers when masks or application of the filter fail. Unsupported imagery/map services keep their map rendering and show feature analysis unavailable.

### Validation

- `npm run phase4:gate` passed: configuration checks, 64 JavaScript tests, 40 regional Python tests, 59 Streamlit tests, production build, Python compilation, and Phase 3/4 contract checks.
- Local browser checks against the public Fire/EMS service confirmed **366 features** for PSEG territory in React and in Streamlit's Python status and iframe. Streamlit's unfiltered full inventory returned 52,010 features; React's unfiltered browse remained capped at 500.
- Plain Vite does not serve the existing `/api/ollama` serverless handler: the local React chat attempt returned HTTP 404. Streamlit chat reached its existing credential check and reported that `OLLAMA_API_KEY` was not configured in the local process. Model-generated answers remain unverified in both local runtimes; both deployed applications remain acceptance checks with their configured API/key. No deployment was made.

### Deployment acceptance still required

Run both deployed apps with their configured Ollama service. Add Fire/EMS, choose PSEG, ask for its feature count and then ask about departments; verify the cited scope and unit. Change scope, refresh, hide/remove layers, and ask again. Exercise search-added and pasted layers, a source-field summary, an unsupported service, and upstream failure. Confirm the current evidence supersedes earlier answers, and that catalog metadata alone never establishes a total.
