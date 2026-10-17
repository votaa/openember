# Feature Request: Ground Chat in Loaded Map Layer Data

Status: proposed; documentation only

Requested: 2026-10-17

## User need

When an operator loads a queryable ArcGIS / Living Atlas layer onto either OpenEmber map, chat should know which layer is active and be able to answer questions about its records, geography, and attributes. For example: “How many Fire/EMS stations are in the PSEG Long Island territory?” and “Summarize the loaded flood-risk features by county.” The answer must identify the source, filter, unit being counted, and whether the result covers the full matching inventory.

## Confirmed current behavior

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

This document requests the enhancement; it does not authorize implementation, deployment, or publication.
