# Hosted grounding correction: bounded scope and acceptance criteria

Recorded November 14, 2026. Implementation target: `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`, starting at `8fdc8ea`. This is the immediate scope/acceptance deliverable, before runtime implementation. The local-first checkout is separate.

**Current acceptance status: FAIL.** The [e480f23 whole-answer review](cloud-preview-e480f23-answer-review-2026-11-14.md) remains failed; GROUND-001/002/003 remain open. A local gate, improved prompt, successful presentation or one good model answer cannot close them.

## Authorized change in scope

The user explicitly authorized this sequence: regressions; evidence selection and unknowns; controlled enforcement for operational triggers; missing/supplied evidence tests; phase-4 gate; repeated hosted whole-answer acceptance.

This **supersedes option A (acceptance review only)** for the affected operational claims. Numeric alert thresholds and mandatory actions now need code-controlled handling linked to an applicable supporting source. Another prompt instruction or regex over arbitrary model prose is insufficient. This is a new runtime behavior and validation scope, not a claim that the earlier option A implementation already enforced it.

Preserve complete enabled KB and supported uploads, supported assignments/deployment/procedures, free-form questions, existing weather selection and readable Markdown. No model change, second reviewer model, production promotion, broad branch merge or new PDF/DOCX ingestion is included. Review and commit remain the user's responsibility; deployment follows the existing preview workflow.

## 1. Freeze failures as regressions first

Use the original mixed-source question and complete synthetic plan. Preserve the e480f23 report as the observed baseline. Its original raw request, source snapshots, model Markdown and timing were not retained; do not invent them. Add deterministic source fixtures with explicitly identified synthetic values and a new fully captured hosted baseline when available.

| Case | Failing behavior | Required result |
| --- | --- | --- |
| REG-TIDE-TRIGGER | “Alert if water rises > 1 ft above the low-tide mark.” | No applicable source supplies this trigger; it cannot become operational guidance. Record the missing threshold/procedure evidence. |
| REG-TIDE-WINDOW | November 14 lows at 04:41 and 17:41 used for an 18:00–06:00 night. | Exclude both from future-window evidence. An observation at 15:24 remains measured current background with its actual timestamp, never tonight's prediction. |
| REG-COMMAND | “Not named in this plan” becomes “without a commander,” vacancy or appointment instructions. | Preserve the source-specific omission in every section. Actual assignment stays unknown unless supported elsewhere; no invented succession/appointment authority. |
| REG-DEPLOYMENT | Inventory of 47 amber cones becomes “ensure all 47” are secured/deployed. | Count stays inventory. Deployment, specifications, ballast and placement are separate fields; no assumption that every listed cone is deployed. |
| REG-FLOOD | Low precipitation probability or a past low tide becomes “flooding unlikely,” reduced site risk or a required surge magnitude. | No site-specific likelihood or reassurance without applicable evidence. Preserve probability/amount, tide/surge and gauge/site distinctions. |
| REG-WIND-TRIGGER | 16 mph forecast gust becomes a cone action limit; “typical tipping thresholds” substitutes for the earlier invented 15 mph limit. | A forecast value is not an equipment/SOP trigger. Numeric and qualitative threshold assertions need their own source. |

Keep earlier drizzle/frost, utility reassurance, date and full-window coverage regressions active. These cases need both missing-evidence and supplied-evidence variants, actual runtime delivery tests and a whole-answer review rubric. Literal phrase checks may diagnose a known failure; they are not a semantic correctness gate.

## 2. Close evidence gaps before synthesis

### CO-OPS time, product and geography selection

Normalize configured CO-OPS responses in both runtimes into source records carrying source ID, exact request URL/parameters, station ID/name/coordinates, station role, product, units, vertical datum, source time zone, fetched time, actual sample/prediction times, quality state and raw-snapshot identity. A fetch time cannot replace a sample time. Resolve `lst_ldt` using the station's IANA zone; new data requests should prefer explicit UTC/GMT where supported. Ambiguous DST/local timestamps remain unresolved rather than being guessed.

Use the authoritative server request interval already resolved for weather. Select prediction events with timestamps in the half-open requested interval; a high/low event has an instant, not continuous coverage. Missing extrema or a partial series cannot establish a full-window minimum, maximum or flood absence. Predictions describe astronomical tides, not a total-water-level/surge forecast. Select measured water/wind observations for requested current/past conditions only, with independent age and quality checks. Optional current background is separately labelled and never used to establish future conditions.

Select the station by explicit requested station/place or a source-backed geographic relationship. A regional reference gauge may be shown as regional context with its role and location; it cannot establish an unspecified facility's water level, flood zone, elevation or risk. Distance alone is not proof of hydraulic applicability. Missing facility linkage remains a gap. Missing/stale/failed feeds remain unavailable; do not substitute zero, an unrelated gauge or cached data presented as fresh.

Remove duplicate unselected CO-OPS values from every model-facing synthesis route, including ordinary live summaries, context cards included as text, old client blocks and relevant cached/map summaries. Keep full raw captures separately and preserve full uploaded document/KB text with its provenance. Uploaded historical quotations remain quoted source material, not eligible current forecast facts. Audit history handling so earlier assistant thresholds cannot be promoted into evidence.

### Source-scoped document state

Carry separate states for supplied, source explicitly omits, unverified extraction, stale, partial and conflicting evidence. Retain document identity, exact supporting passage and location where available, revision/time and applicability. A missing label is extraction uncertainty, not proof the document or incident lacks the fact. Do not hardcode the synthetic plan's names or sentences into production logic.

Represent inventory, deployment status/count/location, commander named/assignment status, listed radio channel and authorized procedure separately. An omission in one source cannot override an explicit applicable fact in another. Conflicting assignments/procedures remain visible conflicts; do not silently prefer latest upload or turn both into absence. A contact list is not a command-succession SOP. Full source text remains available when conservative extraction cannot establish a fact.

### Flood threshold audit

Audit `config/jurisdiction.yaml` and its generated configuration, `streamlit/tidal_gauges.py`, configuration loaders/wizard defaults and all downstream status/percentage displays and model context. The four configured stations currently contain bare action/minor/moderate/major numbers; Python also has six hardcoded station entries and a fallback for unknown stations. A comment saying “ft MLLW” or “based on NWS and CO-OPS” is not a retained authoritative reference for those values.

For each threshold record require: issuing authority/source URL and exact supporting passage/table, station/site, category and comparison operator, value, units, datum, effective/retrieval dates, geographic/asset applicability, and whether it is a flood classification or an actual authorized action procedure. Consult authoritative source material during implementation and retain the retrieved snapshot. Do not infer an alert mandate from a flood-stage category. Datum conversion needs a documented station-specific transformation; no silent MLLW/NAVD88/MHHW interchange.

Produce an audit table with verified/unverified/conflicting status and reason for every configured entry. Unverified entries must not produce actionable flood labels, “NORMAL”/safe reassurance, percentages to an asserted stage or guidance in chat/map/gauge displays. Remove unknown-station fallback thresholds. Preserve raw measured levels with explicit units/datum and an unavailable classification where necessary. Verified applicable thresholds remain usable; quarantine is not a blanket refusal of sourced thresholds.

## 3. Controlled operational claims

### Required boundary

Operational triggers must be application-rendered from validated evidence records. The model may select record IDs and bounded claim/template types; it may not supply an arbitrary numeric threshold, action, authority or applicability as trusted output. Each selected record must resolve to an actual source passage plus the required scope, units/datum and validity. A citation alone does not verify that a threshold or mandate follows from its source.

Use distinct record types for observations/forecasts, inventory, documented deployment, assignment, threshold, authorized procedure, unresolved gap and conflict. A procedure record identifies issuer, action, conditions and authority; a threshold record identifies comparator/value/unit/datum and applicable station/asset/time. Applicability must be established by source evidence, not a model-supplied boolean. Unsupported candidate extraction stays unverified. Conservative supported text formats and reviewed configured records are sufficient for this slice; no universal SOP parser is promised.

For the affected operational-assessment response path, use a bounded response envelope of evidence references and controlled templates for Facts, Possible impacts, Gaps and Suggestions. Validate the envelope and render the displayed answer in application code. All sections, tables and closing text share this boundary. Valid source text, including an authorized procedure, can be rendered with attribution. A missing supporting record yields a precise gap or a conditional verification suggestion, not a model-completed trigger or mandatory action.

**Do not leave a free-text bypass in that response path.** Unrestricted model prose alongside a controlled trigger panel could still invent the same trigger elsewhere. Buffer and validate the bounded envelope before displaying its claims; raw JSON, incomplete claims and provider thinking are not user-visible. Show progress, retain Stop/cancellation and measure the change in first-visible-answer latency. Do not label the answer verified if any unvalidated prose is displayed. Invalid/unresolved envelopes produce an explicit incomplete-answer state and supported code-rendered facts/gaps, without a second model call or silent return to unvalidated prose.

This bounded path covers the mixed-source operational assessments and requests for operational thresholds/procedures. Request routing must be explicit, tested and observable in application metadata; use structured request/source context and expose clarification when unresolved. A trigger word regex cannot establish that arbitrary free-form questions are non-operational. Generic KB questions remain available, but generic fallback must not evade the operational boundary. If routing cannot safely distinguish a request, use the bounded path or clarify. Do not use a fixed question whitelist to pass the original test.

This is intentionally narrower than universal semantic verification: unsupported flood likelihood and command/deployment transformations are prevented in this path by the allowed evidence/claim types and templates. General-purpose factual correctness outside that path remains subject to whole-answer acceptance and must not be advertised as guaranteed.

### Rejection and preservation behavior

- Reject unknown/forged record IDs, source/quote mismatches, substituted numeric values, changed units/datums, stale or out-of-scope thresholds, conflicting procedures, invented mandatory actions and forecast values used as triggers.
- Preserve legitimately supplied named commanders, deployment details, applicable thresholds and authorized radio procedures with exact attribution and conditions. An omitted field elsewhere does not erase them.
- Distinguish “not documented here,” “assignment unknown” and “explicitly vacant.” Even explicit vacancy does not establish appointment authority without a procedure.
- Allow useful conditional impacts and nonmandatory verification suggestions through approved templates. No unsupported qualitative threshold, flood likelihood, all-clear or statement that every fact is verified may bypass the boundary.

## 4. Missing and supplied evidence matrix

Every row must exercise JavaScript/Edge and Python/Streamlit with shared fixtures. Recording-provider tests inspect the actual complete messages and displayed output; template/helper tests alone are insufficient.

| Evidence variant | Expected behavior |
| --- | --- |
| Original complete plan, no supporting threshold or SOP | Recover identifiers/count/channel and source omission; preserve unknown assignment, deployment and authority. No tide/wind trigger or site flood likelihood. |
| In-window and out-of-window tides; current water; stale/null/failed samples | Only eligible predictions support the future window. Current observations retain actual timestamps separately. Exclude bad/ambiguous timestamps and disclose coverage. Test exact start/end boundaries and DST. |
| Explicit station request; known site linkage; absent or conflicting linkage; regional reference gauge | Preserve requested gauge facts and role. Only established applicability can support site conclusions. No invented coordinates or zone membership. |
| Valid sourced threshold and matching procedure | Render exact comparator/value/unit/datum, issuer, action conditions and attribution. Exercise below/equal/above boundaries when the source specifies them. |
| Same numeric threshold with wrong station, datum, units, expired revision or no action authority | Preserve the source as scoped context where appropriate; do not apply it as a site mandate. Explain the exact failed prerequisite. |
| Explicit named commander and documented deployment | Report the supported name, deployed subset/count, location and time; do not conflate remaining inventory with deployment. |
| Applicable authorized DELTA-19 procedure and command-succession SOP | Preserve their exact authorized scope and conditions. Reject an unrelated procedure or a contact list offered as succession authority. |
| Omitted/unverified fields plus supplied facts in another source; conflicting sources | Omission stays source-specific; retain supported facts. Surface genuine conflicts without erasing or inventing assignments. |
| Model attempts unsupported trigger in each section, table, summary or history; malformed/truncated envelope | No uncontrolled operational text reaches display. Supported content remains accessible; cancellation/error is disclosed, not marked a successful full answer. |
| Free-form paraphrases and ordinary KB questions | Routing cannot bypass enforcement; full enabled KB/uploads remain available. Supported non-operational questions still work without a fixed question list. |

## 5. Gates and hosted acceptance

Implementation order is fixed: add regressions; select CO-OPS evidence and carry source-scoped state; audit/quarantine thresholds; implement controlled records/envelope/rendering in both runtimes; run missing/positive/adversarial cases; run the complete phase-4 gate; deploy through the existing review/commit/preview workflow; then repeat hosted acceptance. Failures return to implementation and rerun affected gates.

### Local gate

Run the branch's complete `phase4:gate`, extended to include the new shared fixtures, threshold audit checks, controlled-output tests and actual recording-provider paths. Check request selection and provider delivery, not just prompt wording. Verify rendered sections, retained history, cancellation, error/partial handling and Markdown in the actual UI. Preserve full source uploads and KB without truncation; do not restore stale source summaries through another path. Record test results and risks; no local check is a model-quality verdict.

### Hosted evidence package

Verify the exact deployed Git commit and immutable preview before each session. For each run retain:

- The exact user question, clean/retained-history state, selected area/station/map state, complete enabled KB and uploads.
- Original raw source response bytes, exact URLs/parameters, fetch/issue/valid times, unit/datum/geography/quality and hashes, plus the selected evidence view and threshold audit records used. Capture once per session when freshness allows; disclose changed revisions between sessions.
- Actual client request and **observed final provider request**, including model/options and all messages after server selection, plus the authoritative server receipt time. Reconstructed egress is explicitly labelled and does not satisfy this item.
- Complete provider-visible answer payload/response frames needed to reproduce the displayed content, the entire rendered answer/Markdown, application metadata (routing, selection and enforcement disposition), provider/model identity and deployment identity. Exclude secrets and internal thinking fields. Preserve a rejected or partial response as such.
- Timing: request start, headers, first visible validated answer, completion, total duration and any reported provider metrics. Explain buffering/validation overhead separately from provider generation.

Add preview-only provenance capture before the provider call, disabled by default and restricted to the authorized test request/session. Do not expose keys, unrestricted user documents or general provider egress through a public debug endpoint. The capture mechanism itself needs a recording-provider test proving it records the actual payload, not a reconstruction. If exact snapshots or egress cannot be retained, that run is incomplete acceptance evidence.

### Repeat policy and closure

Run at least **three completed generations per core scenario** on the verified corrective preview: original mixed-source missing evidence; positive thresholds/procedures/assignment/deployment; and conflicting/inapplicable evidence. Also run near-term/later weather, CO-OPS boundary/current-versus-future and missing/stale-data scenarios. Use a predetermined matrix and retain every attempt, including errors, rejections and failures; no retry until a favorable answer then discard earlier results. Use the same captured inputs where valid and disclose freshness-driven revisions; do not claim an exact replay across changed weather or receipt windows.

Review **every section, table, suggestion and closing statement** in every completed answer against that run's snapshots. Each run needs an explicit pass/fail for time/geography, source values, units/datum, coverage/freshness, document states, deployment, command/radio authority, operational triggers and flood/utility likelihood. Later caveats cannot repair earlier claims. Positive scenarios must actually return the supplied supported information; an answer that makes everything unknown fails.

Closure requires all mandatory local checks and all required hosted cases/repeats to pass with complete evidence packages, no unsupported thresholds or mandatory actions, no listed failure transformations and no loss of supported answers. An invalid-envelope safe fallback demonstrates containment, but does not count as a successful complete positive answer. One violation keeps the case failed; after correction repeat the affected matrix on the new verified commit. Three passes are a bounded release criterion, not proof of universal future correctness.

Keep e480f23's historical result **FAIL** permanently. A future passing report may supersede the current release disposition with links to its evidence; it does not rewrite the failed run or silently close GROUND-001/002/003.

## Deliverables and review boundary

1. This scope and acceptance contract, linked from the prior follow-up and failed review.
2. Regression fixtures, CO-OPS selection/state parity, per-entry threshold audit, controlled evidence/output implementation and recording-provider/UI checks.
3. Local phase-4 results, then complete repeated hosted capture/review report on a verified corrective preview.

Runtime implementation has not started in this scope deliverable. Hosted acceptance is still **FAIL / corrective validation pending**. No commit, push, deployment or production promotion is performed by writing this document.

Recommended scope commit: `docs(copilot): define corrective grounding scope and acceptance gates`.

## Implementation follow-up

The [corrective implementation and local verification report](cloud-grounding-corrective-implementation-2026-11-14.md) records the subsequent runtime work, conservative supported source format, default bounded routing, provider compatibility limit, local checks and pending hosted matrix. Those implementation details do not relax the acceptance criteria above. Historical e480f23 acceptance remains **FAIL**; the corrective hosted gate has not run.
