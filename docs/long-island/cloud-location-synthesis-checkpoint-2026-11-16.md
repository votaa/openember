# Batch 3: substantive synthesis contract checkpoint

Date: 2026-11-16. Checkout: `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`, base `7ce8c58`. **The bounded checkpoint passes locally; Batch 3's broad live integration and general source interpretation are not complete.** Hosted acceptance remains open, with its prior failed disposition unchanged. GROUND-001/002/003 remain open.

This implements the before-integration checkpoint in the [location assessment plan](cloud-location-emergency-synthesis-plan-2026-11-15.md). It does not replace the current React/cloud or Streamlit answer path. The new JS/Python functions are invoked by the checkpoint harness only. There was no commit, push, deployment, live generation or UI walkthrough.

## Contract and supported interpretation

[JavaScript](../../src/data/locationSynthesis.js) and [Python](../../streamlit/location_synthesis.py) build a request-local registry from the actual selected-location scope and Batch 2 bundle. Original caller scope is copied, not mutated. The proposal has version `location-synthesis-proposal-v1` and an array of statements, each with category, claim ID, source ID, interpretation and value. The provider is allowed to propose these typed transformations, not arbitrary prose. A proposal reference, JSON envelope or source citation is insufficient by itself: the validator checks exact request-local source/claim binding, value type/value, category and compatible interpretation. New fields, prose, unknown references, altered values and unsupported transformations are rejected individually before rendering.

The checkpoint preserves existing bounded location/jurisdiction and weather records, including current versus latest-reported status, time, units, quality flags and geographic caveats. Nearby weather remains a station reference. Only a valid supplied wind speed or gust can support the wind-related feature checks; a temperature-only observation cannot. Type-specific checks require explicit feature-type metadata; a station ID or the name “Airport” does not silently establish that type.

A small [shared policy](../../shared/location-synthesis-policy.json) defines five descriptive predicates: backup power, helipad, emergency department, single access road and waterfront boundary. Exact whole declarative source lines such as `Example Hospital has an emergency department.` or their supported negative form are extracted independently of complete KB revision matching. Each claim retains exact UTF-16 source spans, the selected display name, source attribution and unresolved source validity/site applicability. The parser does not use partial matches inside conditionals, imperative lines, fenced blocks or paragraphs with added instructions. Source text remains an assertion, not independently verified/current facility status.

These relations support useful interpretation rather than just repeating a source: an emergency-department listing leads to a receiving-capability/access check; a single-access-road assertion leads to checking redundancy and current conditions; a helipad listing leads to checking availability and operating requirements. Shared feature guidance frames airport, hospital, road and waterway questions conditionally, with a wind-evidence reference. Unknown types retain facts, geometry and focused evidence needs rather than receiving airport guidance.

Conflicting positive and negative assertions about the same selected place remain separately attributed and visible. No source precedence is invented, and the corresponding readiness check is withheld. Disabled KB contributes no claims. An uploaded copy cannot impersonate enabled KB. Unrelated regional modules do not expand into a regional hazard/contacts inventory in checkpoint output. Full enabled source text remains in fixture inputs and the original application source path.

## Operational controls and fallback

The narrative channel cannot emit procedures, thresholds, command assignments, radio authorization, routes, rankings, flood-zone findings, shelter availability, mutual aid, equipment stability or operating status. A conditional label or quotation cannot widen its accepted transformations. Existing source-scoped operational records are computed separately by the existing validator; a valid operational record still cannot be selected as an arbitrary narrative interpretation. Their live rendering remains with the existing controlled path pending integration design.

Rejected, malformed, truncated, legacy or empty proposals preserve supported facts and available supported checks, followed by a concise limitation and consequential gaps. Identity-only cases ask for site-linked evidence before a hazard assessment. Metadata separates format status, accepted/rejected claims, evidence coverage, response completeness and `operational_verification: not_established`. A valid proposal is not labeled operationally verified.

## Local evidence

The full phase-4 gate passed, including the new `test:location-synthesis` command. Retained [check totals](acceptance/location-synthesis-checkpoint-2026-11-16/checks.json), [gate log](acceptance/location-synthesis-checkpoint-2026-11-16/phase4-gate.log) and [targeted test log](acceptance/location-synthesis-checkpoint-2026-11-16/targeted-tests.log) document the run. The build's generated changes to tracked `dist` files were restored after validation.

The [fixed-clock inputs](../../tests/fixtures/locations/synthesis-checkpoint.json) and [complete retained projections](acceptance/location-synthesis-checkpoint-2026-11-16/fixture-results.json) compare JS/Python registry, source references, prompt, proposal, complete visible answer, rejection metadata and incomplete fallback. There are 15 cases: KFRG, edited hospital KB, conflicting/disabled/malicious sources, missing/expired/current weather, sparse geometry, road geometry, outside forecast, unknown feature type, ambiguous selection, Unicode spans and unrelated regional modules. Additional tests mutate values, source bindings, categories and operational/local interpretations, including numeric-versus-boolean protocol confusion and malicious extra prose.

Useful positive replays:

- [KFRG](acceptance/location-synthesis-checkpoint-2026-11-16/kfrg-supported.md): retains the supplied 11:00 EST observation at 12:07:10 EST receipt, 4,030 seconds old, with wind/gust/direction and quality flags; produces source-linked helipad/power checks and conditional airport considerations.
- [Hospital](acceptance/location-synthesis-checkpoint-2026-11-16/hospital-edited-kb.md): interprets an edited enabled KB revision into receiving-capability and access-redundancy checks; does not invent trauma designation, capacity or routes and contains no airport guidance.
- [Conflicts](acceptance/location-synthesis-checkpoint-2026-11-16/hospital-conflicting-uploads.md): retains contradictory power assertions with an unresolved conflict and no combined readiness inference.

**All facility descriptive assertions in these checkpoint inputs are synthetic test data. In particular, the KFRG helipad/power statements and explicit airport feature type were supplied for the test; these runs establish no real KFRG facilities or readiness.** Provider proposals are deterministic registry selections, not model-produced answers. Positive replay usefulness and adversarial rejection establish the bounded contract behavior, not live model reasoning, latency, UI transport or hosted acceptance.

Reproduce from this checkout:

```sh
PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run test:location-synthesis
PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate
```

## Checkpoint decision and remaining work

Proceed with this typed, source-linked interpretation approach; it distinguishes useful supported transformations from plausible unsupported claims in both airport and non-airport fixtures. Do not expose unrestricted provider prose. The checkpoint is deliberately separate from broad integration because its finite grammar cannot interpret most existing free-form KB material. Unsupported phrasing remains a material source-coverage gap, not evidence of absence. This is a contract validation increment, not completion of general location-specific synthesis.

Next expand real source adapters and useful positive coverage using actual enabled KB/uploads and source-specific geography/time relationships, without requiring people to rewrite their documents into these example sentences. Then integrate the proposal contract and validation metadata into both provider/request/history paths, retaining the bounded fallback and current source-scoped operational controls. Check unknown types and all feature geometries, then perform Batch 4 presentation and complete React/Streamlit map-to-answer walkthroughs. Repeated real hosted acceptance remains required under the main plan before claiming restored assessment behavior.

Weekly usage was checked at start and during work: 15% initially, 14% at the final checkpoint; the requested stop threshold was below 5%. No reset credits were used.

Recommended review commit: `feat(copilot): add grounded location synthesis validation checkpoint`.
