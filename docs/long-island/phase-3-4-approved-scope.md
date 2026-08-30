# Long Island Data Integration: Approved Phase 3 and Phase 4 Scope

Status: approved for implementation

Approval date: 2026-08-28

## Outcome

Phase 3 will qualify and normalize the approved regional sources, including five active Rockaway operational source families. Phase 4 will display the resulting records with equivalent source cards and map layers in both React/Vercel and Streamlit.

The active Rockaway source families are:

1. NYC 311 service requests.
2. Active cooling centers.
3. Hurricane evacuation centers.
4. NYPD incidents.
5. NYCHA housing developments.

FDNY historical incident data was removed from the active scope on 2026-08-29 because a latest-50-record card cannot support useful period totals and the source is not a real-time operational feed. A future aggregate-query option is retained in `docs/long-island/future-fdny-historical-analytics.md`.

The latter four active families were approved for qualification rather than pre-declared qualified. Phase 3 revalidation found that historical application IDs were stale, removed, or reassigned. The current qualification results and exact gates are recorded in `docs/long-island/phase-3-rockaway-qualification.md`; only verified current IDs may be used.

## Phase 3: qualification and normalization

Phase 3 will:

- Define and test the common normalized regional record described in `docs/long-island/phase-1-field-mappings.md`.
- Implement shared source behavior for timestamps, geometry, attribution, freshness, stale/partial/unavailable states, timeouts, bounded requests, and malformed responses.
- Qualify and normalize Rockaway-scoped NYC 311, cooling centers, hurricane evacuation centers, NYPD incidents, and NYCHA housing developments.
- Implement the already-approved NOAA CO-OPS, USGS Water Data, NYS DEC, NYS Civil Boundaries, and scoped ArcGIS/Socrata adapter families.
- Keep Nassau and Suffolk county layers prototype-only until their production attribution/reuse gates are resolved.
- Keep 511NY, MTA, and NYHOPS disabled until their existing access, proxy/cache, or machine-readable-contract gates are resolved.
- Provide the same normalized records and source-state semantics to React and Streamlit. One interface must not receive broader or less-filtered regional data than the other.

### Rockaway qualification requirements

Each Rockaway dataset must have:

- A documented operational use and authoritative owner.
- A verified current endpoint and bounded sample fixture.
- A source-to-normalized-field mapping.
- A geographic rule that rejects records outside the approved Rockaway scope.
- Valid coordinates or authoritative geometry before a record can be mapped.
- Source, observation/update time, retrieval time, and attribution metadata.
- Explicit current, stale, partial, unavailable, or access-required behavior.
- Contract and geography tests shared across the React and Streamlit delivery paths.

Use Queens Community Board 14 when the source publishes a reliable community-board field. If it does not, use an approved ZIP or authoritative point-in-polygon rule. The current policy intentionally includes Broad Channel; peninsula-only filtering remains a tracked future enhancement. Never relax a failed Rockaway filter to unfiltered Queens or citywide NYC results.

### Phase 3 acceptance criteria

- All five active Rockaway source families have verified current contracts or are explicitly left disabled with a documented reason.
- Fixture tests prove that in-scope records normalize correctly and out-of-scope records are rejected.
- React and Streamlit receive equivalent normalized records for the same fixture.
- Source timestamps remain distinct from retrieval and expiration timestamps.
- Failed, malformed, stale, or empty upstream responses do not appear as current zero-event conditions.
- No browser bundle contains a Socrata token or other server-side credential.
- Existing configuration validation, production build, Python syntax, and diff checks pass.

### Remaining Phase 3 regional-boundary infrastructure

Phase 3 must complete the configured NYS Civil Boundaries integration before
county polygons are treated as an operational geography filter:

- Activate the `nys_civil_boundaries` ArcGIS adapter.
- Retrieve only Nassau, Suffolk, and Queens county polygons and validate their
  canonical FIPS codes (`36059`, `36103`, and `36081`).
- Preserve NYS ITS attribution, source modification metadata, and the published
  as-is/no-warranty disclaimer with the normalized polygons.
- Provide one shared polygon/filter contract to React and Streamlit so later
  Map Builder filtering cannot produce different geographic results between
  interfaces.
- Add fixture coverage proving that unexpected counties, missing or incorrect
  FIPS values, malformed geometry, and failed upstream responses are rejected
  or surfaced through the documented unavailable/stale states.

Phase 3 must also qualify the NYS Department of Public Service `NYS Electric
Utility Service Territories` dataset (`awza-4vgu`) as the authoritative utility
responsibility overlay. The adapter and tests must:

- Resolve the PSEG Long Island territory through the published Long Island
  Power Authority record (`COMP_SHORT = 'LIPA'`, `COMP_ID = '2066'`) and retain
  the source note that PSEG manages the infrastructure.
- Retrieve and identify the relevant municipal electric territories: Freeport
  and Rockville Centre in Nassau, and Greenport and Fishers Island in Suffolk.
- Preserve `COMP_FULL`, `COMP_SHORT`, `COMP_ID`, `DATEMOD`, `NOTES`, NYS DPS
  attribution, and the dataset's accuracy/currency limitation with every
  normalized multipolygon.
- Treat the publication as current/as-needed but disclose that the source
  geometry currently reports a 2016 `DATEMOD`; do not infer recent boundary
  verification from the portal publication date alone.
- Validate polygon topology, municipal exclusions, overlap/gap behavior, and
  the LIPA polygon's intersection with Queens Community Board 14 before using
  it as a Rockaway electric-service boundary.

The shared geography contract will distinguish:

- **General operational geography:** Nassau County, Suffolk County, and the
  approved Rockaway geography. General emergency-management assets such as
  hospitals, fire/EMS stations, and shelters remain eligible throughout this
  area, including municipal electric territories.
- **PSEG Long Island responsibility:** the validated LIPA/PSEG service-territory
  polygon. Use this narrower geography only for PSEG-specific responsibility,
  outage, and infrastructure views.
- **Municipal electric responsibility:** the relevant Freeport, Rockville
  Centre, Greenport, and Fishers Island service-territory polygons.
- **All electric territories in scope:** the intersection of the general
  operational geography with the union of the applicable LIPA/PSEG, municipal,
  and—where the approved Rockaway geography requires it—Con Edison territory.

## Phase 4: React and Streamlit display parity

Phase 4 will add equivalent user-facing source cards and map toggles for both React/Vercel and Streamlit.

The Rockaway display set is:

- NYC 311 service requests.
- Active cooling centers.
- Hurricane evacuation centers.
- NYPD incidents.
- NYCHA housing developments.

Each interface must:

- Render approved point, line, or polygon geometry without inventing missing locations.
- Keep each source as a separate card and layer toggle.
- Show source owner, Rockaway/Queens scope, observation/update time, data age, attribution, and data state.
- Provide useful map popups using only normalized source fields.
- Distinguish live or periodically updated incidents from static/reference facilities, including NYCHA housing developments.
- Show stale, partial, unavailable, and access-required states instead of silently hiding failures.
- Produce the same record counts for the same normalized snapshot, allowing only presentation differences.
- Keep county and regional layers visually distinct from Rockaway-specific layers.

### Remaining Phase 4 regional-boundary display work

After the Phase 3 boundary adapter passes its acceptance criteria, Phase 4 will:

- Expose Nassau, Suffolk, and Queens as optional county-boundary overlays in
  both React/Vercel and Streamlit.
- Expose the validated LIPA/PSEG and relevant municipal electric territories as
  visually distinct, optional responsibility overlays.
- Add two selectable filtering modes for supported Map Builder Feature Layers:
  - **Limit to operational geography** uses Nassau, Suffolk, and the approved
    Rockaway geography and preserves assets inside municipal utility areas.
  - **Limit to PSEG Long Island territory** uses only the validated LIPA/PSEG
    service polygon and excludes municipal and other non-PSEG territory.
- Apply the selected mode through the shared Map Builder Feature Layer contract
  regardless of whether a layer was added through ESRI/Living Atlas search,
  Living Atlas quick-add, or a pasted Feature Service URL. This includes the
  hospitals and fire/EMS stations quick-adds.
- Label filtering as a display/query scope applied after **Add to Map**; it does
  not narrow Living Atlas search results or change the upstream source dataset.
- Disable the geography modes with an explanation for Map Services, imagery,
  vector tiles, or other layer types that cannot honor the shared Feature Layer
  spatial-filter contract.
- Keep the original nationwide service URL and source attribution visible so a
  geographic display filter is not mistaken for a locally owned or complete
  local dataset.

The Queens county polygon does not define the Rockaway Peninsula: FIPS `36081`
covers all of Queens. Rockaway remains governed by the approved Queens
Community Board 14 rule, including Broad Channel, until a future authoritative
peninsula polygon is approved. The county-overlay work must not silently replace
that Rockaway rule with the broader Queens polygon.

### Phase 4 acceptance criteria

- All five active Rockaway sources are visible through separate cards and toggles in React/Vercel and Streamlit.
- A user can identify the source, scope, timestamp, and freshness of every displayed layer.
- No citywide NYC record is presented as a Rockaway condition.
- Broad Channel inclusion is consistent with the approved Phase 3 geography policy.
- Desktop, tablet, and narrow-layout map checks pass for React.
- Streamlit map rendering and session-state layer persistence pass.
- Equivalent fixture snapshots produce matching React and Streamlit feature counts.
- Nassau, Suffolk, and Queens overlays render from the validated shared county
  polygons, and the electric responsibility overlays remain visually distinct.
- Both Map Builder modes produce equivalent React and Streamlit results for a
  Feature Layer added through Living Atlas search, quick-add, and pasted URL.
- **Limit to operational geography** retains fixtures located in municipal
  service territories, while **Limit to PSEG Long Island territory** excludes
  those same fixtures.
- Unsupported non-Feature Layer types remain unfiltered and disclose that state
  rather than appearing to honor a spatial limit.

## Phase boundary

Approval adds these sources to Phase 3 qualification and Phase 4 display scope. It does not pre-approve an endpoint that has changed, waive geographic filtering, enable a gated feed, or treat a candidate dataset as operational before its Phase 3 acceptance criteria pass.
