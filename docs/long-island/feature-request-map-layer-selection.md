# Feature Requests: Map Basemap and Layer Selection

Status: implemented locally October 18, 2026; validation recorded below; deployment acceptance pending

Requested: October 17, 2026

Applies to: OpenEmber Streamlit operational map and React/Vercel operational map

## Requested outcomes

1. **Streamlit:** Default to OpenStreetMap and allow the operator to switch away from CARTO Dark Matter without changing application configuration.
2. **Streamlit:** Provide Select All / Unselect All to quickly show or hide all operational map overlays.
3. **Vercel:** Provide an equivalent all-layers On/Off action while retaining individual controls. Evaluate using the existing `MAP` label as the control, with a visible aggregate selection state.

**Confirmed clarification:** For Vercel, turning layers back On must enable all main overlays and loaded added layers, plus Phase 4 layers previously enabled individually during this session (including participating layers individually turned off earlier). Untouched Phase 4 layers stay Off. It must not merely restore the previous selections. Apply the same Select All semantics to Streamlit for consistent behavior.

## Current behavior and evaluation

Inspected the local implementation at `/Users/anthonyvota/Projects/openember`, branch `main`, commit `eeb5ed8`, on October 17, 2026. The checkout was clean. These findings describe source code; deployed application behavior was not independently checked for this request.

### Streamlit

- `streamlit/carto_tiles.py` selects CARTO Dark Matter when a CARTO key is configured; otherwise it selects OpenStreetMap. This is configuration-driven, rather than an operator preference.
- `build_map()` in `streamlit/app.py` registers only that selected basemap, then adds Folium's layer control. OpenStreetMap and CARTO are not both offered as alternative basemaps.
- Five standard overlays use sidebar checkboxes. Weather uses separate radar/wind checkboxes. Regional source cards have their own show/hide actions. Added layers use the `map_layers` collection and a `visible` property.
- Live CO-OPS tidal gauge markers form a separate overlay, added whenever gauge data exists; they are distinct from the standard stream-gauge layer.
- Folium's in-map overlay controls operate alongside Python/sidebar state. Standard overlays disabled in the sidebar are omitted from the generated map, so a bulk action limited to the currently rendered Folium layers could not enable every eligible overlay.
- Streamlit also has a separate ArcGIS Map Builder with its own basemap and visibility controls. The requests below target the main operational map; extending them to that separate map is a follow-up scope decision.

### React/Vercel

- The operational map is the inline `MapPanel` in `src/App.jsx`. A separate `src/components/MapPanel.jsx` also exists; implementation must target the component actually used by the app.
- `MAP` is currently a static text label. Adjacent pill buttons individually toggle Flood Risk, Gauges, Shelters, Trauma Centers, and EOC / Command through `activeMapLayers`. These buttons already expose `aria-pressed`.
- The 311 Rockaway pill and regional source-card actions use `activePhase4Layers`. Weather pills under `WX` use separate `showRadar` and `showWind` booleans.
- User-added ESRI layers are stored in `esriMapLayers` and included in `activeRegionalMapLayers` by their presence in that collection. The ESRI panel offers removal and geography filtering, without an equivalent per-layer visibility toggle. Removal deletes the layer entry; it is unsuitable for a reversible bulk Off action.
- The map attaches a CARTO tile layer independently of its overlays. This request changes the Streamlit basemap default; a Vercel basemap change is outside this request.
- Therefore, changing only `activeMapLayers` would leave regional, ESRI, radar, and wind overlays visible. A complete all-layers control must coordinate these states.

## Request 1 — Streamlit basemap choice

Provide a clearly labeled **Basemap** selector, preferably in the existing layer selector or immediately beside the map controls:

- **OpenStreetMap:** selected by default on a new session, whether or not a CARTO key is configured.
- **CARTO Dark Matter:** an optional alternative when its existing configuration is available. If unavailable, omit or disable it with a clear explanation.
- Keep exactly one basemap selected. Choosing OpenStreetMap replaces CARTO rather than drawing both together.
- Preserve the current map center, zoom, overlay selections, and loaded layer data when switching basemaps.
- Keep attribution appropriate to the selected provider.
- Preserve the selected basemap across ordinary Streamlit reruns and in-session data refreshes. Proposed persistence boundary: reset to OpenStreetMap in a new session; a saved cross-session preference is not required.

**Acceptance:** A session with CARTO configured still opens on OpenStreetMap. The operator can switch to CARTO and back without editing secrets or configuration, losing overlays, or resetting the map view.

## Request 2 — Streamlit Select All / Unselect All

Add adjacent **Select All** and **Unselect All** actions to the operational map layer controls, plus an `All`, `Some`, or `Off` selection indicator.

- Select All enables every participating operational overlay. Unselect All hides every operational overlay, leaving the selected basemap visible.
- Cover the standard layers, map-ready regional layers individually activated during the session, loaded user layers, radar, wind observations, and separate live tidal gauge overlay.
- Keep every individual checkbox and in-map layer selection consistent with the resulting state. Individual selection remains available after either bulk action.
- Store visibility in application/session state so a rerun, feed refresh, or map rebuild does not unexpectedly turn hidden overlays back on.
- Add explicit visibility state for overlays that currently render solely because data exists, including live tidal gauges.
- Update widget state through callbacks before widgets are instantiated. A client-side Folium plugin alone is insufficient unless its visibility changes are synchronized back to the application.

**Acceptance:** With multiple standard, weather, regional, tidal, and user overlays present, Unselect All leaves only the basemap. Select All enables all participating overlays, including ones individually disabled before Unselect All. The result survives a rerun and data refresh; an individual layer can still be hidden afterward.

## Request 3 — Vercel MAP all-layers control

### Recommended interaction

Yes: the existing `MAP` label can become the bulk control. Make it a real, visibly clickable control with an adjacent state label or icon, rather than relying on highlighting alone. Recommended presentation: **MAP · ALL**, **MAP · SOME**, and **MAP · OFF**.

| Aggregate selection | Presentation | Activation does |
| --- | --- | --- |
| All eligible overlays selected | Highlighted `MAP · ALL` | Unselect All |
| At least one, but not all, selected | Distinct `MAP · SOME` | Select All |
| No overlays selected | Unhighlighted `MAP · OFF` | Select All |

Use checkbox semantics with an indeterminate state for `Some`, styled to fit the control rail. A native checkbox with a visible MAP label is preferable; a custom equivalent must expose checked/mixed state and keyboard interaction. Provide visible focus and accessible text such as `Select all map overlays` / `Hide all map overlays`. Highlighting must not be the only state cue.

The partial state matters: after an operator hides one individual layer, the master must not continue to claim that all layers are On. Activating `Some` selects all; the next activation hides all.

### Scope and state

- Include the same overlay categories as the Streamlit request, where present: standard layers, individually opted-in map-ready regional layers, loaded ESRI layers, radar, and wind. Because this spans the current `MAP` and `WX` groups, expose the scope through nearby help text: `Main map overlays, weather, added layers, and Phase 4 layers enabled during this session`.
- Keep individual pills and source-card controls synchronized. Add a per-layer show/hide action for loaded ESRI layers so hidden layers can be individually re-enabled without re-adding them.
- **Confirmed correction, October 18, 2026:** Use the corrected startup selection in both apps: all Phase 4 layers start Off, including 311 Rockaway, NYS boundaries and utility service areas. A Phase 4 layer joins the master control only after the operator enables it individually; its participation persists for the session, including after bulk Off or an individual hide. Standard overlays and weather retain their existing startup defaults. The master state reflects only participating overlays. Untouched Phase 4 layers do not affect All/Some/Off and are not enabled by Select All. Unloaded catalog items are not auto-added.
- Derive the master state from individual selections. Do not use an independent boolean that can disagree with the displayed layers.
- Bulk Off preserves loaded ESRI entries, records, filters, styling, and source metadata. Implement visibility separately from removal.
- Bulk On enables all main overlays, added layers, and eligible Phase 4 layers individually activated during this session. Never auto-enable an untouched Phase 4 layer. A simple global visibility gate that restores an earlier subset does not satisfy the confirmed requirement.
- Keep map center, zoom, basemap, geography filters, and loaded data intact when toggling visibility.

**Acceptance:** One activation from `All` hides every operational overlay, including weather and added ESRI layers. The next activation enables all participating overlays. Turning off one individual layer produces `Some`; activating `Some` enables it again. Individual controls and the map agree after each action. Keyboard users can operate and identify the master control and its state.

## Shared scope and edge cases

The following are proposed implementation rules, rather than additional user-confirmed requirements:

- **Eligible** means a configured operational overlay that can currently be enabled, or a user-added layer already loaded into the map. Respect existing map-ready checks. Select All does not search the catalog, load every available service, bypass access requirements, or render unsupported layers.
- **Off** controls visibility. It does not delete layers, clear KB selections, alter saved catalog metadata, or turn off the map itself. Basemap selection is separate from overlay selection.
- **Selection is not data health.** An enabled layer can contain zero records or fail to refresh. Keep unavailable/stale/error indicators separate from `All`/`Some`/`Off`; do not report an upstream failure as a successful empty layer.
- Preserve visibility across ordinary refreshes and rerenders in both apps. Streamlit's Folium controls, sidebar controls, and Python state must share one effective visibility contract.
- New eligible layers added or becoming available while all overlays are Off should remain hidden until individually enabled or Select All is used. While all are On, newly added eligible layers should be enabled. In a partial state, preserve existing selections and enable a layer explicitly added by the operator.
- Removing an added layer updates the master state and prevents Select All from resurrecting it. With no eligible layers, disable the bulk action and show `No overlays available`.
- Close popups and clear an active feature selection if its layer becomes hidden. Do not leave an inspection panel implying the hidden feature is still displayed.
- Keep loaded-layer chat grounding aligned with effective visibility, following the existing visible-layer evidence contract. A bulk hide must not leave hidden ESRI layers represented as currently visible chat sources. Preserve separately saved KB metadata and other independent source context.
- Retain all geography, time-window, browse-cap, attribution, and failure semantics. Bulk selection changes visibility, not source query scope.

## Implementation and validation notes

Use a common inventory of overlay IDs and effective visibility in each runtime. Derive bulk state from this inventory and apply bulk updates through the same state paths as individual controls. React must coordinate standard, regional, ESRI, and weather state; Streamlit must also reconcile Folium events and explicit tidal-gauge visibility with session state.

Validate each app with standard layers, a regional layer, weather, and a loaded ESRI layer. In Streamlit, include separate live tidal gauges and test with and without CARTO configuration. Exercise all-to-off-to-all, a partial selection, individual re-enabling, refresh while Off, adding/removing a layer, empty/unavailable data, preserved map position, and hidden-layer chat evidence. Check keyboard operation and visible state labels. Deployment acceptance is required after any future implementation.

## Local implementation — October 18, 2026

Implemented in the React operational map and Streamlit operational map:

- Streamlit starts on OpenStreetMap even with CARTO configured. Its session-owned Basemap selector offers CARTO only when configured and retains the map view and overlay selections.
- Streamlit Select All / Unselect All covers standard, map-ready regional, loaded user, radar, wind, and separate live tidal overlays. Each has explicit visibility state. Folium registers hidden overlays so they can be individually enabled in-map; `OperationalLayerControl` sends stable overlay IDs through the Streamlit component event protocol, and `on_change` reconciles session/widget state before widgets render. The minimum `streamlit-folium` version is now 0.27.4.
- React has a native tri-state checkbox labeled MAP · ALL / SOME / OFF with visible scope text. Bulk On enables all participating overlays rather than restoring an earlier subset. Added ESRI layers have separate visibility and removal actions.
- Both runtimes preserve loaded records, filters and metadata on hide, exclude hidden added ESRI layers from visible chat evidence, clear feature inspection when visibility changes, and retain Off for newly added/available layers. Following manual review on October 18, regional startup selection was restored to no Phase 4 layers in both apps, including 311 Rockaway. Phase 4 participation in Select All is opt-in for the session after individual activation. The separate Streamlit ArcGIS Map Builder remains outside the bulk control.

Local validation:

- `npm run phase4:gate`: config validation, regional/Streamlit tests, production build, contract checks, Python compilation, and whitespace checks pass using a temporary Python environment with the application dependencies installed.
- Regression coverage includes aggregate states, all/off/all overriding individual choices, removal, adding while Off, OSM/CARTO availability and defaults, rendered hidden overlays with loaded user/tidal data, actual Streamlit widget lifecycle/rerun behavior, and preservation of visibility events across competing viewport updates and rapid toggles.
- Chrome checks on the local React app passed all/off/all, individual mixed state, native Space-key operation, loaded ESRI hide/show/removal, and hidden chat-evidence presentation. The ESRI service was intercepted with fixture data.
- Chrome checks on a local Streamlit harness using the actual application map function and callbacks passed all/off/all, Folium-to-sidebar visibility synchronization, mixed state recovery, OSM/CARTO selector round trips, and preservation of a changed center/zoom through these actions. The harness used fixture regional and user data with a synthetic CARTO configuration; CARTO provider authorization and live feed availability are not established by these checks.

Production deployment and live acceptance on Vercel and Streamlit remain pending. This work does not commit, push, publish, or deploy the implementation.
