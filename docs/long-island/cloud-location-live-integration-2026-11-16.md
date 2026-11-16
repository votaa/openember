# Batch 3: live selected-location synthesis integration

Date: 2026-11-16. Checkout: `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`, base `c3f6528` (`feat(copilot): expand grounded KB and upload interpretation`), confirmed clean before work. **Local provider integration and recording-browser verification pass. Hosted/model acceptance remains open, with the prior failed disposition unchanged.** No commit, push or deployment was performed.

## Behavior

[Shared JS routing](../../src/data/liveAnswer.js) and [Python routing](../../streamlit/live_answer.py) activate `location-synthesis-proposal-v1` for an actively selected map location's emergency assessment. The contract is now used by the real Edge handler and Streamlit provider function. Ordinary queries, current-measurement readouts and operational-procedure questions retain the existing bounded path. A mismatched/changed selected-location question receives the existing clarification behavior.

The source-scoped operational validator runs before route selection. Narrative interpretation cannot approve a threshold, procedure, command assignment or radio authorization. Existing operational-query behavior and its positive/negative regressions remain intact. Live synthesis retains weather, selected identity, administrative relationships and supported source assertions independently of the provider's optional selections.

Provider prompts contain the full enabled source context and uploads. The model-facing scope contains a compact synthesis inventory rather than another copy of the complete registry. Only conditional considerations enter the provider selection registry; already-supported facts need not be echoed in a potentially truncated proposal. The 96 KiB prompt limit, 8,192-token output reserve and 2 MiB upstream capture bound remain unchanged. Oversized prompts are rejected without shortening sources or calling the provider.

Both paths buffer provider content and validate it before display. Valid envelope shape, source/claim references, exact values, categories and compatible interpretations remain separate checks. Unsupported selections, malformed output, length truncation, missing terminal frames and interrupted/invalid streams retain the supported fallback. For synthesis requests, Edge HTTP/connection failures also return the supported fallback with explicit completion metadata, without displaying untrusted provider error prose.

The retained request scope includes `synthesis` claims/candidates/coverage and final validation. Enforcement metadata records route, completion reason, output characters and provider-call status. Format status, claim rejection, evidence coverage, response completeness and `operational_verification: not_established` remain distinct. React's existing scope callback/history and Streamlit's actual assistant-message scope preserve the final result and full raw-source inspection. A valid proposal is not operational verification.

## Handoff and timing corrections

The Streamlit walkthrough exposed a selected-map snapshot being lost when refreshed source data changed the component hash during a rerun. Its callback now retains the clicked snapshot before that remount, while ignoring new selection during a pending answer. A regression checks retention when the component's subsequent return is reset. This carries the clicked source snapshot; it does not promote its attributes into verified facts.

Actual boundary lookups can complete just after request receipt. County-contact selection now allows the shared five-minute future-fetch tolerance (`boundary_future_tolerance_seconds: 300`) relative to request start, as well as the existing one-hour maximum age. This accommodates same-request lookup completion and small clock skew; it does not make future conditions observable. Tests cover +1s and +300s fetch times, reject +301s, and retain the stale-boundary limit. Existing recorded future-hour and bad-FIPS cases remain excluded. This updates the stricter zero-future-age choice in the preceding source-adapter increment.

## Verification

The complete `npm run phase4:gate` passed: **241 JavaScript checks and 169 Python test runs**, including suite repetitions, configuration validation, production build and compilation. See [totals](acceptance/location-live-synthesis-2026-11-16/checks.json), [gate log](acceptance/location-live-synthesis-2026-11-16/phase4-gate.log), and [targeted log](acceptance/location-live-synthesis-2026-11-16/targeted-tests.log).

The [24-case integration projections](acceptance/location-live-synthesis-2026-11-16/fixture-results.json) compare JS/Python route selection, retained scope/registry, instruction, visible answer, validation and parsed model-facing scope. [Actual Edge-handler recording runs](acceptance/location-live-synthesis-2026-11-16/edge-runs.json) retain provider inputs and complete output scopes for valid, unsupported, truncated, missing-terminal, malformed, HTTP-failure and connection-failure cases. Tests compile and execute the actual Streamlit provider function and actual history helpers for KFRG, hospital and retained exercise-upload inputs, with no cloud generation.

Recording-browser checks:

- **React:** hospital marker → Send to Chat and KFRG wind marker → Send to Chat both show useful source interpretation; KFRG retains the 4,030-second latest report. Final validation and source registries persist in history. Raw sources start collapsed and remain inspectable. A subsequent typed observation question has no selected location or synthesis registry and does not change earlier scopes. Three recording-provider calls, zero cloud model calls. [Complete capture](acceptance/location-live-synthesis-2026-11-16/react-browser-results.json).
- **Streamlit:** actual KFRG marker → retained selection → Send to Chat produces source-supported coordination considerations and latest-reported weather. Raw source inspection and an unrelated typed-query carryover check pass. The actual retained native history contains the final map synthesis validation; the later typed response has no selected location or synthesis registry. Two recording-provider calls, zero cloud model calls. [Browser capture](acceptance/location-live-synthesis-2026-11-16/streamlit-browser-results.json), [actual native history and provider requests](acceptance/location-live-synthesis-2026-11-16/streamlit-history.json).

Screenshots: [React](../../output/playwright/live-synthesis-react.png) and [Streamlit](../../output/playwright/live-synthesis-streamlit.png). Browser fixture helpers are [Edge](../../scripts/serve-live-synthesis-fixture.mjs), [Streamlit](../../scripts/serve-live-synthesis-streamlit.py), [React assertions](../../scripts/verify-live-synthesis-ui.js) and [Streamlit assertions](../../scripts/verify-live-synthesis-streamlit-ui.js).

These are **local recording-provider results, not live model reasoning or current-source verification**. KB and hospital entries are repository snapshots; the retained upload is a synthetic exercise plan. React uses frozen fixture time. Streamlit uses synthetic fixture measurements with observation times relative to the local request clock. Boundary responses are recorded fixtures, not new service queries. No real provider/model latency or hosted acceptance is established. Browser Streamlit coverage is KFRG; hospital and upload Streamlit behavior is covered by execution of the real provider function, not a new non-airport browser walkthrough.

A final clean gate passed after stopping a stalled earlier verification process. Local test servers/browsers were stopped, and generated changes to tracked build/cache files were restored. Test evidence and source changes remain uncommitted for review.

## Next

Proceed to Batch 4's location-centered presentation and remaining full UI cases, then use the established preview workflow after review to verify the deployed commit and collect repeated real hosted runs. Source adapters remain finite: arbitrary prose, aliases, source-validity dates and additional alert/flood/gauge geography are still coverage limitations. Missing extraction remains unknown. GROUND-001/002/003 stay open until the required repeated hosted grounding/usefulness matrix passes.

Weekly usage was checked throughout: 12% remaining initially, 7% at the final checkpoint, above the requested below-5% stop threshold. No reset credits were used.

Recommended review commit: `feat(copilot): integrate validated location synthesis across chat paths`.
