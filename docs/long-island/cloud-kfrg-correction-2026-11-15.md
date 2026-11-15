# KFRG observation and map-to-chat correction

Base: `02bff38`, branch `codex/cloud-upload-coverage`, checkout `/private/tmp/openember-cloud-upload`. Status: uncommitted local review candidate. **Hosted acceptance remains FAIL.**

The user's two hosted failures are regressions within the existing current-observation and map-to-chat scope:

1. `what is the most recent weather observations for KFRG?` returned an incomplete-envelope warning and a generic no-weather gap. The pasted scope was `unspecified`, with no selected interval.
2. Clicking the KFRG wind marker and using **Send to Chat** generated `Tell me about emergency considerations for KFRG — Republic Airport — Wind: 13mph from 300° (gusts 18mph) · Clear`, but returned only the generic gap, without the provider-format warning.

These historical observations come from the user's pasted results. Their original complete client payloads and provider output were not captured here. The local evidence below must not be labelled a hosted rerun.

## Root causes and change

- **Time selection:** “most recent” was not recognized. It now resolves to the same current-observation policy as “latest”: eligible observations no older than one elapsed hour. A selected map observation supplies station identity directly and establishes current scope when the question has no explicit time. An explicit future request retains its requested interval.
- **Map handoff:** wind markers fetched their own observations but sent only display text to chat. The handoff now retains the complete source payload, source URL, station ID, coordinates, observation time and fetch time. The selected snapshot replaces the same station's chat-cache entry for this request; it does not silently substitute another station. The raw-source viewer includes the selected snapshot. Streamlit carries its selected wind snapshot through pending-query state as well.
- **Misleading source summaries:** a measured `windSpeed.value` was mistaken for forecast `windSpeed.values`. This produced “Updated: unknown” and empty wind lines even for a valid observation. JS/Python now summarize timestamped observations before checking forecast grids, preserving measured values, units and quality codes. Consequently the earlier pasted source summaries do **not** establish that their underlying observation payloads were empty. A new public KFRG response was retained as an immutable regression fixture; it is not a reconstruction of the earlier response.
- **Missing or invalid evidence:** failed station retrievals remain represented in the snapshots. Gaps now identify the station and distinguish retrieval failure, invalid payload, stale data, invalid coordinates, station-identity mismatch and unavailable measured values. A station identity mismatch cannot produce an observation fact.
- **Provider dependency:** simple, eligible current-weather readouts render validated records directly in React/Edge and Streamlit, with `provider_called: false` and `deterministic_observation` metadata. Operational triggers, mandatory procedures and mixed document questions retain the existing controlled route. This is a narrow summary path, not a whitelist replacing cloud/KB inquiry. Airport consideration requests receive a relevant limitation about operating status, runway conditions and applicable limits; station wind alone does not determine them.
- **Provider diagnostics:** model-routed answers now retain completion reason, output character count and whether a provider was called in application metadata. Protected preview audit capture still records actual request/output when enabled. The historical malformed or incomplete provider response has not been recovered; this change removes that dependency for the two supported KFRG readouts rather than claiming its historical cause is known.
- **Acceptance tooling:** direct observation cases are explicitly recorded as having no provider request/model generation. They are no longer falsely rejected for missing provider egress. Model-routed cases still require observed egress; deterministic rendering is not semantic acceptance by itself.

## Validation

The exact wording, observation-summary and missing map-payload cases failed before the fixes. New tests now cover those cases, JS/Python parity, direct rendering without a provider, stale measurements, failed retrieval, malformed payload, station mismatch, invalid selected stations and preservation of explicit future scope. The previous stale-station assertion was updated to require the new specific gap.

`PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate` passed: **182 JavaScript checks and 147 Python test runs** (including shared-suite repetitions), configuration and phase validation, production build, Python compilation and whitespace checks. [Gate output](acceptance/kfrg-local-2026-11-15/phase4-gate.log).

A separate fixed-clock local browser exercised the exact typed question and the actual KFRG marker → **Send to Chat** control. Both passed, retaining KFRG, timestamp, wind, gusts, direction, source provenance and collapsed source inspection, with **two requests and zero provider calls**. The fixture uses the captured NWS-shaped response with explicitly adjusted time and wind fields (13/18 mph display equivalents), not live weather. Public feed failures elsewhere in the fixture are intentional. [Complete browser artifacts](acceptance/kfrg-local-2026-11-15/browser-results.json), [typed answer](acceptance/kfrg-local-2026-11-15/typed-answer.md), [map answer](acceptance/kfrg-local-2026-11-15/map-answer.md). The initial browser assertion incorrectly counted the initialization message as an answer; the assertion was corrected and the workflow rerun successfully. Streamlit changes have parity tests and compilation coverage, not a new Streamlit browser walkthrough.

No cloud generation, commit, push or deployment was performed for this candidate. Unrelated `.DS_Store` content was preserved. The local-first checkout remains untouched.

## Hosted acceptance still required

After review, commit and push through the existing Git preview workflow. Suggested commit: `fix(copilot): preserve station observations through map chat`.

On the verified new preview, repeat the exact typed question and marker handoff at least three times each. Confirm station/time/source preservation, concise useful output and `provider_called: false` for eligible observation readouts. Test stale, missing, malformed and alternate-station cases without substituting another location. Repeat broader missing/supplied/conflicting evidence and authorized-procedure cases through the model route, retaining actual egress, output, model and completion metadata and reviewing every answer section. The user should not have to rewrite “most recent” as “latest” or repair the app's generated question.

All grounding issues and the hosted acceptance failure remain open until those hosted results meet the existing contract.
