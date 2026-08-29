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

### Phase 4 acceptance criteria

- All five active Rockaway sources are visible through separate cards and toggles in React/Vercel and Streamlit.
- A user can identify the source, scope, timestamp, and freshness of every displayed layer.
- No citywide NYC record is presented as a Rockaway condition.
- Broad Channel inclusion is consistent with the approved Phase 3 geography policy.
- Desktop, tablet, and narrow-layout map checks pass for React.
- Streamlit map rendering and session-state layer persistence pass.
- Equivalent fixture snapshots produce matching React and Streamlit feature counts.

## Phase boundary

Approval adds these sources to Phase 3 qualification and Phase 4 display scope. It does not pre-approve an endpoint that has changed, waive geographic filtering, enable a gated feed, or treat a candidate dataset as operational before its Phase 3 acceptance criteria pass.
