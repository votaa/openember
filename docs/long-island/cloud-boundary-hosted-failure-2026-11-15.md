# Hosted boundary lookup failure — Edge compatibility correction

Base: `2c1186391bec4fac98febf8b473d00e7d3431e45`, branch `codex/cloud-upload-coverage`, checkout `/private/tmp/openember-cloud-upload`. Local correction candidate, uncommitted. The existing hosted preview is still that base commit and remains a **failed boundary smoke test** pending a new deployment and retest.

## Observed failure

The user tested `https://openember-5f4mgzi79-ember-li.vercel.app/` with the KFRG wind marker and Brentwood HS evacuation-shelter marker. Both visible answers retained their selected identity but reported local jurisdiction unresolved. Both Gaps sections reported `boundary_retrieval_failed` for county, city/town and village. These were inspected in the user's existing browser; no additional cloud generation was performed. This is visible-output evidence, not a complete provider/request audit capture. Exact user-request geometry/source revisions were not exported from that session; subsequent reproductions use the configured map coordinates.

The deployed code swallowed the underlying exception, so the old answers contain no more-specific failure stage. A deployment-scoped Vercel application-log lookup returned no entries in the requested window. The Node-based Edge emulator and direct Node/Python source checks passed, which initially left a hosting/runtime difference unresolved.

## Reproduced mechanism

A separate **workerd 2026-11-15** runtime rejects the original `redirect: "error"` fetch option before issuing the HTTP request. A minimal probe reported a TypeError saying the redirect value must be follow or manual. The same POST with manual redirect handling returned HTTP 200 from the fixed public NYS endpoint. Normal public-CA TLS verification was enabled in the probe; certificate validation was not bypassed.

The full lookup module from the original commit and the current patched module were then bundled separately and executed in workerd against live NYS data:

| Configured geometry | Original module | Patched module |
| --- | --- | --- |
| KFRG point `[-73.4134, 40.7288]` | All three levels unavailable, `boundary_retrieval_failed` | County: Suffolk; Town: Babylon; no village intersection |
| Brentwood HS point `[-73.246, 40.7776]` | All three levels unavailable, `boundary_retrieval_failed` | County: Suffolk; Town: Islip; no village intersection |

This reproduces the hosted failure pattern and identifies a concrete runtime incompatibility in the original code. The exact exception from the original hosted requests was not available, so final confirmation on Vercel remains required. [Original/patched workerd comparison](acceptance/boundary-hosted-debug-2026-11-15/workerd-comparison.json), [repeatable runtime-check capture](acceptance/boundary-hosted-debug-2026-11-15/workerd-repeatable-check.json).

The earlier local browser fixture and Node-based emulator accepted `redirect: "error"`; those checks missed this incompatibility. They remain transport/rendering evidence, not hosted-runtime acceptance.

## Correction

- Use `redirect: "manual"` and explicitly reject all 3xx responses. Redirect destinations are never followed. The fixed server-owned NYS endpoints, POST queries, complete geometry, size/match limits and six-second timeout remain in place.
- Do not cancel a successfully consumed response stream. Cancel early termination within a guarded cleanup block and release the reader lock. The isolated manual-redirect probe succeeded even with the old completed-stream cancellation, so stream cleanup is defensive hardening, not the reproduced root cause.
- Resolve the default fetch through the global fetch receiver. This is also defensive compatibility handling, not the reproduced root cause.
- Retain bounded failure diagnostics in scope metadata: `failure_stage`, `error_type` and allowlisted `failure_code`. Emit the same sanitized failure fields to application warning logs with the layer ID. No error message/stack, coordinates, query body, credential/header or arbitrary error cause is serialized. This distinguishes query construction, fetch, response headers, response reading, JSON decoding and source-record validation on future failures.
- Preserve existing unknown/partial coverage behavior. A lookup failure still cannot invent a county, municipality, shelter opening, capacity or response authority.

Python already rejects redirects without following them and does not use the unsupported JavaScript fetch option. Its behavior was not changed for this runtime-specific correction. Successful source normalization and answer-record parity remain covered by the shared tests; diagnostic fields are additional JavaScript transport metadata.

## Verification

- Full `PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate` passed: **207 JavaScript checks and 161 Python test runs**, including repeated shared suites, build, config validation, compilation and whitespace checks. [Gate log](acceptance/boundary-hosted-debug-2026-11-15/phase4-gate.log).
- New regression tests failed against the original implementation and pass with the correction. They exercise a runtime that rejects the unsupported redirect option, redirect refusal, safe failure diagnostics, invalid JSON, successful stream completion, and Brentwood through the actual Edge handler using a recording provider. The latter requires Suffolk/Islip and does not permit inferred shelter availability or command authority.
- The standalone `npm run test:jurisdiction-workerd -- /new/output.json` check runs the original committed and current lookup bundles against the live public NYS service in a real workerd process. Provide `WORKERD_BIN` or install workerd on PATH. It uses a temporary localhost port and temporary bundle/config directory, preserves existing capture files and cleans up its worker process. It contacts no model endpoint. This separate network/runtime check passed for both KFRG and Brentwood; it is not part of the offline phase-4 gate.
- [Fresh live-source replay](acceptance/boundary-hosted-debug-2026-11-15/live-source-results.json) also passed KFRG, hospital, Brentwood, crossing line/polygon, coastal point and sparse geometry with no cloud model calls. The source-verification script now accepts a new output path and refuses to overwrite historical evidence.

## Review and hosted retest

No commit, push or deployment was performed. Recommended commit: `fix(copilot): support boundary fetches in hosted Edge runtime`.

After user review and commit/push through the existing preview workflow, verify the deployed SHA. Repeat KFRG and Brentwood marker → Send to Chat at least three times each. Require Suffolk/Babylon and Suffolk/Islip respectively, retained raw/provenance/history, correct selected identity and no inferred shelter/airport status or authority. If a lookup fails, retain the new staged diagnostics and inspect the sanitized runtime warnings before changing transport or sources again.

Keep the boundary smoke failure and broader hosted grounding/usefulness acceptance open until those actual preview checks pass. The latest-reported observation issue, regional KB relevance and later synthesis/presentation batches remain outside this correction.
