# Corrective implementation and local verification — November 14, 2026

Implementation target: `/private/tmp/openember-cloud-upload`, `codex/cloud-upload-coverage`, after scope commit `4ce55af`. Changes are uncommitted for user review. The [corrective acceptance contract](cloud-grounding-corrective-scope-2026-11-14.md) governs release. **Hosted acceptance remains FAIL; GROUND-001/002/003 remain open.** No hosted corrective generation, deployment, commit, push or production promotion is claimed here.

## Implemented behavior

Both Edge and Streamlit now normalize CO-OPS snapshots and select prediction instants against the authoritative half-open request window. Measured observations retain actual timestamps and preliminary/verified quality; flagged samples are excluded, and current background is separate from future predictions. The observation age policy is 18 minutes; snapshots older than one hour are stale independently. New configured requests use GMT. Older `lst_ldt` snapshots use the station zone and reject ambiguous/nonexistent DST clocks. Source metadata, units, datum, station coordinates/role and coverage limitations survive. An explicit named station excludes unrelated stations. Facility linkage requires an explicit source record; regional gauges or distance do not establish it.

CO-OPS prose is removed from legacy live source blocks before synthesis, including old tidal-gauge summaries. Complete uploaded documents remain intact. The Python gauge popup no longer treats the first high/low of the current day as the next event; new timestamps are explicit UTC. Raw original capture bytes remain separate from selected evidence.

Document fields retain exact attributed statements. Inventory, deployment, named commander/assignment status, listed channel and authorization are distinct. Omissions cannot override a supplied assignment in another source; non-extraction is a source-specific coverage gap. Conflicting statements are retained as conflicts. The synthetic plan's identifier, count and late channel remain recoverable without hardcoding their values in production.

### Operational output boundary

The default route is `bounded_evidence_default` for all requests: there is no keyword-based generic fallback that could bypass enforcement. The provider receives complete enabled KB/uploads and selected evidence, then returns only an `operational-answer-v1` envelope selecting reference IDs. The application independently renders facts, conditional cone impacts, source gaps, source excerpts and verification suggestions. Provider prose, extra fields, unknown IDs, interrupted output and invalid envelopes never become displayed operational claims. Invalid output yields an explicit incomplete-answer state with available supported facts/gaps; it is not a successful positive answer.

The current [Ollama structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs) says cloud inference does not support structured outputs. Accordingly, **no provider `format`/schema option is sent**. JSON instructions request the envelope; application parsing, ID checks and controlled rendering enforce the display boundary. No regex claims to verify arbitrary prose. There is one provider call and no reviewer model. Hosted repeats must measure whether this model follows the envelope reliably.

This changes the answer's expressive surface: general questions receive selected exact source excerpts and application-owned facts rather than unrestricted model-written synthesis. All full sources still reach the provider, and supported labelled facts/procedures remain usable. Relevance and usefulness of broad questions need hosted review; safety containment alone is insufficient acceptance. Rendering currently uses controlled bullet sections. No promise of a universal document parser, authority verifier or hazard-likelihood estimator is made.

Claims are buffered until the envelope is complete and validated. Initial application metadata is streamed immediately; React Stop cancels before claims display and leaves an explicit stopped message. Previous answers remain visible. This is an intentional departure from progressive prose streaming and must be included in latency measurement.

### Explicit operational source format

Conservative labelled text fields remain available as attributed source statements. To promote an operational threshold, mandate or facility/gauge linkage into the controlled record set, use a supported text document containing:

- `Facility ID: <target>` matching the explicitly requested target.
- A fenced `operational-evidence-v1` JSON record with kind, target, authority, exact source URL, valid start/end covering the whole requested window and a supporting statement.
- The exact canonical supporting sentence on its own line outside the JSON block. A model cannot supply or alter this record.

Threshold records carry quantity, comparator, numeric value, compatible units, datum and station ID. Procedure records carry conditions and action. Gauge-linkage records carry station ID and the source-stated basis. Canonical sentence mismatch, incomplete validity, incompatible units, mismatched target and conflicts block promotion. Quoted source requirements retain issuer, validity, conditions and attribution; they do not independently authenticate the issuer. The [positive exercise fixture](../../tests/fixtures/corrective/positive-plan.md) illustrates the threshold/procedure format with **synthetic values, never operational guidance**. Existing prose that is not extracted stays available as exact attributed reference text; it does not become an independently validated mandate.

No automatic threshold exceedance/action engine or datum conversion is added. The response retains an applicable source comparator/value; it does not issue a flood classification or action from astronomical tide predictions. Full-window validity, compatible units and a source-backed station/site connection remain prerequisites for any later comparison logic.

## Flood-threshold audit and quarantine

The [audit registry](../../shared/flood-threshold-audit.json) covers all six previous Python station defaults and the four configured stations. [Official NOAA responses and retrieval manifest](acceptance/threshold-audit-2026-11-14/manifest.json) retain hashes, URLs, timestamps and failures. Four official metadata queries returned JSON; Governors Island and Bergen Point returned 404. The [NOAA metadata documentation](https://api.tidesandcurrents.noaa.gov/mdapi/prod/) identifies separate NOS/NWS flood fields and station datum resources; the captured flood-level responses do not establish a datum conversion or facility action authority.

| Station | Previous action/minor/moderate/major settings | Disposition |
| --- | --- | --- |
| 8518750 Battery | 4.5 / 5.5 / 6.5 / 8.5 | Unverified; captured official values differ and datum/effective-scope reconciliation is absent. |
| 8516945 Kings Point | 4.5 / 5.5 / 6.5 / 8.5 | Unverified; official action is null; other captured values differ; no valid conversion/authority established. |
| 8531680 Sandy Hook | 4.5 / 5.5 / 6.5 / 8.5 | Unverified; official metadata is retained but not reconciled to these settings. |
| 8510560 Montauk | 3.5 / 4.5 / 5.5 / 7.0 | Unverified; official metadata is retained but not reconciled to these settings. |
| 8518995 Governors Island | 4.5 / 5.5 / 6.5 / 8.5 | Unverified; metadata endpoint returned 404. |
| 8517741 Bergen Point | 4.5 / 5.5 / 6.5 / 8.5 | Unverified; metadata endpoint returned 404. |

Bare legacy settings remain in configuration for audit, but generated exports/loaders do not expose them as operational stages. The wizard no longer creates numeric defaults, and the gauge classifier no longer assigns fallback thresholds to unknown stations. No `NORMAL`, flood-stage label or percent-to-minor display is generated from these unaudited levels. The additional hardcoded 5/10-foot classifications in React USGS readings and Streamlit CO-OPS/USGS readings are also removed; no station-specific source or datum applicability supported them. Unknown classifications use neutral styling. Raw water levels stay available with units/datum and a classification-unavailable label. No captured metadata value has been silently installed as a replacement threshold. Explicit supported source thresholds remain answerable through the operational record path above.

## Local verification

The extended full `phase4:gate` covers configuration validation, production build, Python compilation, prior regional/upload/window/grounding/evidence suites and the new corrective JS/Python checks. Existing recording-provider tests now return the bounded envelope and retain their complete-source/request-delivery assertions; they do not score a generated model answer. Shared corrective fixtures cover the six failure families, positive commander/deployment/threshold/radio evidence, wrong target/units, expired validity, mismatched supporting text, conflict, time boundaries, observation/forecast separation, stale/failed/flagged samples, named-station selection, explicit versus conflicting gauge linkage, malformed/forged/truncated model output and protected audit capture.

The real React app was exercised against the actual local Edge handler and a recording provider, with three browser requests and **zero cloud model calls**. Checks passed: no claims before envelope validation, positive facts/procedures preserved, unsupported trigger withheld with an incomplete-answer state, Stop before validation, and retained answers. Browser layout was inspected. The map retains its unrelated tile-key warning. Repeat with local Vite on port 5181, `node scripts/serve-corrective-fixture.mjs` on loopback 5182 and Playwright CLI running `scripts/verify-corrective-ui.js`. This fixture does not establish hosted/model reliability or byte-identical weather replay.

The [local result record](acceptance/corrective-local-2026-11-14/checks.json) records the final gate and browser outcome. Build/dependency caches are excluded from the review diff; generated jurisdiction exports are retained because their threshold quarantine is intentional. Only `src/App.jsx` changed among JSX components; no new renderer or TSX component was introduced.

## Hosted capture and remaining gate

The Edge supports opt-in capture only when `VERCEL_ENV=preview`, a preview-only `EMBER_PREVIEW_AUDIT_TOKEN` is configured, and the matching request header is supplied. It emits the actual provider-call payload and server receipt time to that requesting test session, not logs or a public debug endpoint. Credential headers and provider thinking are excluded. It also captures raw provider answer content, response model, terminal metrics and enforcement disposition. Capture is disabled by default. Remove the preview token after acceptance.

The hosted runner now includes normalized CO-OPS snapshots, requires `PREVIEW_AUDIT_TOKEN` for live corrective acceptance, saves `provider-request-OBSERVED.json` and `provider-response-OBSERVED.json`, and marks an uncaptured provider request as incomplete evidence. Its Vercel CLI transport passes the audit header via a temporary private file; tokens are not written to capture artifacts or command arguments. Reconstructed files remain explicitly reconstructed.

After user review/commit/push and a verified preview of that exact commit, configure the preview-scoped audit token and capture a complete fresh source session, including CO-OPS. Run the documented missing, supplied and conflicting scenarios at least three times each, plus the time/geography/staleness cases. Retain every attempt, raw source snapshot, actual request, complete answer, model, application metadata and timing. Review every section; rejected output is containment evidence, not a passing complete answer. Broad-answer utility, concise presentation, plain-prose source extraction limits and cloud envelope compliance remain material acceptance risks.

Recommended commit: `fix(copilot): constrain operational claims and scope coastal evidence`.
