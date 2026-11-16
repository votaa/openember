# Batch 3: interpret configured KB and retained upload formats

Date: 2026-11-16. Checkout: `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`, base `904ac73`. Local source-coverage increment after the [synthesis checkpoint](cloud-location-synthesis-checkpoint-2026-11-16.md). **The checkpoint now reads existing repository source formats; live synthesis integration and hosted acceptance remain open.** No commit, push, deployment, real model generation or UI walkthrough was performed.

## What changed

[JavaScript](../../src/data/sourceInterpretation.js) and [Python](../../streamlit/source_interpretation.py) add three source-format adapters to the existing request-local synthesis registry:

- **Hospital lists:** Read exact selected names from the configured Nassau/Suffolk semicolon-separated hospital sections, including edited revisions. Render an attributed listing and a check of current facility capabilities/access. Keep the complete entry, including dated or pending qualifiers, in its source span and claim metadata. Do not promote a list heading, ACS text or a historical designation into a current trauma designation, capacity, ranking or transport destination. Abbreviated helipad entries remain unresolved; no fuzzy hospital alias is invented.
- **County coordination contacts:** Parse the telephone from an enabled source or upload. Select a county reference only when the request scope contains a matching recorded NYS county intersection with the configured service URL, layer, county name and FIPS. Require selected geometry, the full-geometry reference, an `intersects` relationship and a boundary fetch age between zero and 3,600 elapsed seconds, inclusive. This one-hour boundary-reference policy is an application freshness choice, not a statement about legal boundaries. A contact remains an unverified source listing; neither the intersection nor the listing establishes full containment or command authority. Crossing geometry can retain both county references.
- **Uploaded inventory and deployment:** Reuse the existing labelled-field extraction and strict scalar grammars, after linking the selected display name to the upload's single explicit Facility ID. Preserve inventory separately from a deployed subset, with source attribution and unresolved current validity. Numeric descriptions are not action thresholds. Radio authority, command succession, procedures and triggers remain outside this narrative channel and under the existing source-scoped operational validator.

Users need not rewrite these existing list and field formats into `Place has ...` sentences. The original descriptive grammar remains available. New adapter-only predicates cannot be enabled by merely writing `Place has a coordination contact.` The shared policy contains interpretation templates, not cached hospital entries or phone numbers; values are recovered from the actual supplied source text.

Claims retain source ID, exact UTF-16 span, subject, location relationship and unresolved source validity. Boundary relationships retain their own URL, fetch time and FIPS. `coverage.adapter_claims` distinguishes newly adapted claims from the legacy descriptive grammar. Format/claim/coverage/completeness metadata and `operational_verification: not_established` remain separate.

Conflict comparison now groups by **relation and subject**. Two counties' different contacts are not a conflict. Two sources' different telephone values for the same county, or different inventory counts for the same selected facility, remain separately attributed and unresolved; the corresponding verification interpretation is withheld. No date-based precedence is guessed. Source text and uploaded copies retain their provenance; copied upload bodies do not become enabled KB claims.

Both adapters and the original descriptive parser now share Markdown fence handling: backticks and tildes, matching fence character, sufficient closing length and CRLF/UTF-16 offsets. Source field values containing extra operational directions cannot enter the typed registry. Unrecognized material remains inspectable and explicitly unrepresented rather than being interpreted as absent.

## Source evidence and validation

The [24 fixed-clock inputs](../../tests/fixtures/locations/source-adapters.json) use actual configured KB text from `config/jurisdiction.generated.json`, configured hospital names/coordinates, recorded NYS county response fixtures, and the exact retained upload from `acceptance/corrective-9862a66-2026-11-15/supplied-01/upload.txt`. Tests check the unchanged KB and upload bytes against their owning repository sources. See the [source manifest](acceptance/location-source-adapters-2026-11-16/source-manifest.json) for hashes and provenance.

These are **frozen source replays, not verification of current conditions**. The upload is the previously retained **synthetic exercise plan**, not a real operational inventory. Weather snapshots come from existing fixed-clock fixtures; hospital station values are fixture data. Boundary fetch times are replayed at the fixture request clock to test applicability/freshness; they are not new service receipts. The crossing, conflict, edit, malformed and stale variants intentionally modify fixture inputs. No claim is made that the historical source listings or telephone numbers are currently correct.

Positive projections:

- [KFRG with configured KB](acceptance/location-source-adapters-2026-11-16/kfrg-real-kb.md): preserves the 67m 10s latest-reported observation and uses the recorded Suffolk intersection to select an attributed Suffolk coordination reference. It does not insert Nassau contacts or unrelated hospital/flood-zone inventories. The station's missing feature-type metadata remains a gap rather than being silently upgraded to an airport type.
- [North Shore University Hospital](acceptance/location-source-adapters-2026-11-16/hospital-real-kb.md): interprets the existing hospital entry and Nassau contact without requiring new source sentences or a complete matching KB revision. Its operational status, designation and receiving capability remain unverified.
- [Retained exercise upload](acceptance/location-source-adapters-2026-11-16/retained-upload-inventory.md): preserves 47 amber cones as inventory, separately from the 12 deployed and 35 remaining in the source, without promoting the plan's command, radio or numeric-trigger text.

The [complete projections](acceptance/location-source-adapters-2026-11-16/fixture-results.json) retain input, registry, exact source spans, proposed typed selections, visible answer and validation metadata. JS/Python compare the full projections. Additional positive/adversarial checks cover pending designation, edited/disabled KB, uploaded KB copies, exact-name versus unsupported aliases, missing/stale/future/invalid boundary relationships, crossing geometry, conflicting contacts/inventory, unlinked uploads, operational tails, Markdown fences, Unicode/CRLF, and water/shelter/road cases that must not inherit regional zones, availability or route directions. Existing source-scoped operational and historical grounding regressions remain in the full gate.

Run:

```sh
PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run test:source-interpretation
PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate
```

See [check totals](acceptance/location-source-adapters-2026-11-16/checks.json), [targeted log](acceptance/location-source-adapters-2026-11-16/targeted-tests.log), and [full gate log](acceptance/location-source-adapters-2026-11-16/phase4-gate.log). Proposals are deterministic registry selections, not model-produced responses. The full gate includes configuration validation, build, existing tests and the new suite. Generated changes to tracked build outputs are restored after verification.

## Next checkpoint

This establishes useful source interpretation for existing repository formats; it does not establish general free-form document understanding. Aliases, arbitrary unlabelled prose, source validity dates, flood-zone/alert/layer geometry, gauge-to-site relationships and additional facility facts still require dedicated adapters or review. Missing extraction is not absence or an all-clear. The conservative existing copied-upload section handling can also leave some duplicate context unrepresented.

Next integrate the proposal contract, buffering, validation metadata and supported fallback into both live provider/request/history paths, with real-source positive cases retained as regression requirements. Keep the existing source-scoped operational path and full source viewer. Then perform complete React/Streamlit map-to-answer walkthroughs, Batch 4 presentation, and repeated real hosted acceptance. Check provider completion, prompt/output sizes and useful evidence coverage during integration; a successful deterministic replay is insufficient. GROUND-001/002/003 and the prior hosted failed disposition remain open.

Weekly usage was monitored; 13% remained initially and the last check showed 12% remaining, above the requested below-5% stop threshold. No reset credits were used.

Recommended review commit: `feat(copilot): expand grounded KB and upload interpretation`.
