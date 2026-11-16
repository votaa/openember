# Restore location-specific emergency assessments in the preview

Date: 2026-11-15. Original planning baseline. Implementation has started in the [selected-location transport increment](cloud-selected-location-implementation-2026-11-15.md); the full plan and hosted acceptance remain open.

Target checkout: `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`, inspected at `7ab50d9` (`fix(copilot): include KB context in emergency assessments`). Recheck branch, changes and deployment identity before implementation. The separate local-first checkout is not the implementation target.

Boundary follow-up: the [NYS administrative lookup increment](cloud-boundary-lookup-implementation-2026-11-15.md) implements the source decision and server-owned geometry lookup locally; hosted acceptance remains open.

Batch 2 follow-up: the [location-linked evidence increment](cloud-location-evidence-bundle-2026-11-15.md) retains eligible latest-reported readings and source/location/time relationships locally; substantive synthesis and hosted acceptance remain open.

Batch 3 checkpoint follow-up: the [typed synthesis/validation checkpoint](cloud-location-synthesis-checkpoint-2026-11-16.md) passes bounded KFRG and hospital replay locally. It is not enabled in the live answer path; general source interpretation, broad integration and hosted acceptance remain open.

Batch 3 source-coverage follow-up: [configured KB and retained upload adapters](cloud-location-source-adapters-2026-11-16.md) extend the checkpoint to existing hospital lists, geometry-linked county contacts and attributed inventory/deployment fields. Live integration and hosted acceptance remain open.

Batch 3 live-integration follow-up: [selected-location synthesis now reaches both provider/history paths](cloud-location-live-integration-2026-11-16.md), with local recording-browser checks and the full gate passing. Batch 4 presentation and repeated real hosted acceptance remain open.

## Intended outcome

Fold this work into the preview branch's grounding improvements. Restore the hosted product's useful location-centered emergency-considerations behavior for **all locations that can be sent to chat**, while correcting unsupported claims. This is a recovery of expected product behavior, not a new airport-only feature or a replacement with generic regional summaries.

For a selected airport, hospital, road, creek, shelter, infrastructure feature or ordinary map point, answer the question about that location using applicable evidence. Preserve supported facts, explain relevant conditional considerations, and identify consequential unknowns. Use regional context only where its relationship to the question is established. Limited metadata must produce a limited but useful answer, not an invented identity or a region-wide checklist.

The older hosted KFRG response is a presentation and intent reference, not factual ground truth. Do not restore its unsupported jurisdiction, runway, operating-limit, utility-status, dispatch, mutual-aid or evacuation claims.

## Observed failure and implementation anchors

- `src/data/mapInteraction.js` normalizes names and descriptions but does not preserve general feature geometry and identity comprehensively. `src/App.jsx` sends the generated question plus `feature.observation`; general feature context is not carried through the same structured selection path.
- `src/data/cloudRequestScope.js` accepts only a catalogued `nws_observation` selection. General location resolution cannot be recovered reliably from the rendered question alone.
- `src/data/answerRecords.js` and `streamlit/answer_records.py` restrict provider output to predefined record IDs. This prevents arbitrary operational claims, but also prevents useful synthesis for evidence not represented in the record catalog.
- `src/data/kbAnswerRecords.js`, `streamlit/kb_answer_records.py` and `shared/kb-context-records.json` insert regional summaries for matching emergency queries. Exact source-revision matching is required; edited/custom KB text cannot currently be summarized through this route. Enabling a module does not establish its relevance to the selected site.
- Observation freshness selection in `src/data/requestScope.js` and `streamlit/request_scope.py` removes fields after the 60-minute limit. In the supplied preview case, KFRG was observed at 11:00 EST and requested at 12:07:10 EST. It was correctly ineligible as current, but its latest reported values disappeared from the answer entirely.
- `validated_envelope` checks output structure, not geographic correctness, useful synthesis or fulfillment of emergency-assessment intent.

Keep the prior grounding trackers and hosted failures open until new acceptance evidence supports closure. Read the existing focused-response and emergency-KB correction documents before editing; their local checks do not establish hosted success.

## Batch 1 — Preserve the selected location end to end

1. Define a shared, versioned selected-location contract and fixtures for JS/Python. Include stable source/feature identity where available, display name, source URL/layer identity, geometry and coordinate reference system, feature type, selected attributes with provenance, observed/fetched times, and any station identity. Record unknowns explicitly.
2. Carry it from map feature construction through normalization, Send to Chat, request serialization, server validation, scope resolution and retained chat history. Preserve supported point, line and polygon geometry. Do not silently treat a line or polygon centroid as its complete footprint. Bound payload sizes and attribute/geometry complexity.
3. Treat client attributes as attributed source snapshots, not independently verified facts or instructions. Validate shape, finite coordinate ranges, identifiers and allowed fields server-side. Do not fetch arbitrary client URLs. Preserve the existing server-owned provider, timezone and scope controls.
4. Resolve municipality/county from a configured authoritative lookup or boundary source with recorded provenance. Separate configured application jurisdiction (for example Long Island) from the selected feature's local jurisdiction. Handle intersecting boundaries, ambiguous names and missing geometry without guessing. A station label alone does not prove facility ownership, footprint or emergency authority.
5. Define conflict precedence: an explicit typed question that contradicts the selected location must trigger a focused clarification or a disclosed unresolved scope, not silent reuse of stale selection. Starting an unrelated chat request must not inherit the previous feature accidentally.

Deliverable: the same selected-location identity and geographic uncertainty reach both React/cloud and Streamlit answer assembly. Preserve the current station-specific path while extending it.

## Batch 2 — Separate evidence availability, freshness and applicability

1. Keep the existing current-observation age rule. Add a separate latest-reported/background representation containing values, units, quality flags, station, observation time, fetch time, evaluated age and reason current eligibility failed.
2. When an otherwise valid observation exceeds the current threshold, show it as **latest reported; outside the current freshness window**, with timestamp and age. Do not turn it into a current fact, continuous historical coverage, future condition or operational all-clear. Invalid identity, invalid timestamps/coordinates, failed retrievals and missing values remain distinct cases; this is not permission to display every rejected payload.
3. Distinguish observation age from cache/source age. Define and document the background retention policy in shared configuration, including very old records. Use the supplied 67-minute KFRG case as a required positive example, and include a clearly unusable old snapshot case. Never relax current eligibility to hide the regression.
4. For non-station features, select available station evidence using a documented geographic rule. Include station identity, distance where geometry supports it, and representativeness limits. Nearby is not on-site; never substitute another station silently for an explicitly requested one. An elongated road or polygon may need more than a single-point reference.
5. Keep current observations, future hourly/grid evidence and later forecast periods separate under the existing time-window rules. Verify forecast footprint before applying it to a selected location; a region-labelled point forecast is not region-wide evidence. Do not introduce an unrelated forecast as a replacement for missing current measurements.
6. Build an evidence bundle with claim/source IDs and explicit location/time relationships for weather, alerts, loaded layers, enabled KB and uploads. Missing coverage is not evidence of no hazard, no outage or normal operations. Preserve full enabled source material and raw-source inspection.

Deliverable: useful latest-reported information can survive without bypassing current/future, geography or quality checks.

## Batch 3 — Restore substantive synthesis while retaining operational controls

1. Replace unconditional emergency-topic expansion with a relevance stage centered on the selected feature, question, applicable hazards and available evidence. Feature type informs considerations; it must not supply invented facts. Unknown feature types use available geometry and evidence without an airport-style fallback.
2. Extend the controlled answer architecture to represent location identity, attributed source facts, geographic relationships, source-supported context, conditional considerations and material gaps. Remove the requirement that every useful contextual statement already exist as a fixed regional paragraph.
3. Implement a structured synthesis proposal with source/claim references. Resolve references against the actual request bundle and validate values, location/time applicability and claim category before rendering. A valid JSON envelope or a citation alone does not prove a claim. Reject unsupported added facts, not merely malformed output.
4. Keep source-scoped operational validation for numeric action thresholds, mandatory actions, radio authorization, command assignments and procedures. Neither narrative synthesis, quotes, citations nor a “conditional” label may bypass it. A general consideration may recommend checking a relevant condition; it may not invent a local procedure or trigger.
5. Support interpretation of enabled KB and uploads beyond exact prewritten module revisions. Preserve attribution and distinguish a source's assertion from independently verified/current status. Edited sources should not automatically collapse the entire assessment to a revision-review gap. Conflicting sources must remain visible and unresolved where no precedence is established.
6. Use general feature-type guidance only to frame conditional questions/checks, not to assert site exposure, resources, operating limits or authority. Avoid unsupported nearest-hospital rankings, transport routes, flood-zone membership, mutual aid, shelter availability and equipment stability.
7. If validation cannot support proposed prose, retain verified location/weather facts and useful supported considerations, with a concise limitation. Do not fall back to all regional modules or an answer consisting only of generic disclaimers. If only identity is known, state that limitation and identify the next relevant evidence needed without fabricating a hazard assessment.
8. Distinguish metadata for format validation, claim validation, evidence coverage and response completeness. Do not present `validated_envelope` as operational verification.

Implementation checkpoint: before broad integration, replay KFRG and at least one non-airport fixture through the proposed synthesis contract. Demonstrate both useful source-supported interpretation and rejection of plausible unsupported local/operational claims. If the validator cannot distinguish them, revise the design; unrestricted provider prose is not an acceptable shortcut.

## Batch 4 — Present the answer around the selected place

Lead with the location and supported local jurisdiction, followed by a concise synthesis of the most relevant considerations. Present latest reported weather and its age where relevant, a few supported considerations, then consequential unknowns and practical verification needs. Use a table only where it improves comparison.

Avoid leading the user-facing answer with an ISO interval, internal route names, a regional KB inventory or repeated station-versus-facility boilerplate. Preserve detailed scope and provenance in inspectable metadata. Keep Request sources collapsed by default, distinct from the answer, and retain them in history. Do not conceal stale data or material uncertainty in the collapsed section.

For KFRG, the response must retain the station identity and latest supplied wind/gust/direction with observation time and stale-current label, focus considerations on the selected airport, and avoid assigning runway status, aircraft limits or response authority from weather alone. For other feature types, the content must change meaningfully with evidence and location rather than merely substituting the feature name.

## Validation and acceptance

Use shared fixed-clock fixtures and JS/Python parity tests for the contracts and substantive behavior. Add assertions for supported information that must survive as well as unsupported claims that must be rejected. Existing safety tests must continue to pass.

| Case | Required result |
| --- | --- |
| KFRG, supplied preview timestamps | Latest reported 11:00 EST reading retained and labeled 67m 10s old at receipt; not current; airport-specific considerations; no invented local facts |
| Fresh named station | Correct identity, values, units, quality and provenance; no silent substitution |
| Hospital or other critical facility | Facility-centered considerations; no inferred capacity, trauma designation, operating status or command authority |
| Road/bridge line feature | Geometry preserved; access considerations tied to applicable evidence; no invented closure or evacuation route |
| Creek/coastal feature | Relevant water/hazard context; gauge relationship disclosed; no conversion of tide height into site flooding likelihood |
| Shelter or ordinary point | Distinguish map listing from open/available shelter; useful limited answer for sparse metadata |
| Ambiguous or missing location | Preserve what is known; focused uncertainty/clarification; no guessed county or facility |
| Boundary-crossing feature | Multiple/uncertain jurisdictions disclosed; no centroid-only assignment |
| Stale, very old, missing or invalid observation | Different dispositions; no current all-clear; useful valid background only under documented policy |
| Forecast outside site footprint/time | Excluded from site claims with relevant coverage gap |
| Edited/disabled KB; conflicting uploads | Edited supported facts remain interpretable, disabled material absent, conflicts visible; no mandatory-policy bypass |
| Question changes after selection | No unintended location carryover; explicit conflicts handled |

Run targeted suites while developing, then the existing `npm run phase4:gate` with the checkout's documented Python environment. Verify actual map → Send to Chat → request → answer → retained history in React and Streamlit. Recording-provider tests establish transport/rendering only.

After user review, commit/push through the existing preview workflow and verify the deployed commit. Collect real hosted runs for KFRG plus hospital, road, water feature and sparse-location cases; repeat each at least three times, including stale/missing and edited-source variants. Retain exact selected feature, question, enabled source revisions, observation/request times, provider request/output, model, complete visible answer and scope/validation metadata. Check latency and truncation as well as content.

Acceptance requires both **grounding and usefulness**: a location-centered response with preserved supported facts and meaningful relevant considerations, plus no unsupported operational/geographic claims. Changing only the title, returning only gaps, reproducing the generic regional KB list or accepting valid JSON is a failure. Keep hosted acceptance open if any required case fails.

## Review, delivery and recovery

Suggested implementation order: selected-location contract → evidence freshness/applicability → synthesis/validation checkpoint → presentation → complete local gate → repeated hosted acceptance. Keep JS/Python behavior aligned in each step rather than postponing parity.

Keep the existing bounded renderer available as an explicit incomplete-answer fallback during development. Do not revert grounding protections to recover richer prose. A deployment rollback must identify the prior commit and acknowledge its known usefulness limitation; it does not turn that commit into an accepted solution.

This document authorizes no implementation, commit, push or deployment by itself. The user requested planning now and will review/implement later. No new provider, paid data service, production data migration or general map redesign is required by this plan; any necessary new geographic source should be proposed with coverage and provenance before integration.

Recommended plan-only commit: `docs(copilot): plan grounded location-specific emergency assessments`.

Suggested later implementation commits:

1. `fix(copilot): preserve selected location through map chat`
2. `fix(copilot): retain aged observations with explicit applicability`
3. `fix(copilot): restore grounded location-specific emergency synthesis`
4. `test(copilot): verify location assessment usefulness and grounding`

Related context: [focused-response correction](cloud-focused-response-correction-2026-11-15.md), [emergency KB correction](cloud-emergency-kb-correction-2026-11-15.md), and [grounding issues](cloud-mixed-source-grounding-issues.md).
