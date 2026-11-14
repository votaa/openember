# Cloud preview next slice: implementation and local acceptance

Implemented locally November 14, 2026 in `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`. Narrow item 3 is **A: acceptance review only**, selected by the user. Changes remain uncommitted for user review. Hosted/model acceptance is **pending**, not passed by these deterministic checks.

## Result

- Shared weather policy selects fresh measured observations for current/past requests, hourly plus grid evidence before receipt + 24 elapsed hours, and point periods plus grid evidence at/after that boundary. Crossing windows expose separate eligibility segments and retain original source intervals. Rolling hours/days, calendar days, named nights and existing operational-period resolution remain distinct. An undated forecast uses the supplied available horizon with a disclosed assumption.
- Observation snapshots retain the actual observation timestamp, station, coordinates and units. Observation age and location availability determine eligibility independently of fetch time. Latest-only observations do not establish continuous historical coverage or facility applicability. Existing configured observation endpoints are refreshed without station discovery.
- React ordinary live API summaries omit NWS forecast/observation values. The Edge and Streamlit synthesis paths remove legacy NOAA/NWS weather blocks and supply complete selected WINDOW MATCHES. Enabled KB, complete uploads, unrelated live sources, map evidence and alerts remain available. Full raw source caches/captures are unchanged.
- The facts/gaps aid carries source metadata, bounded weather navigation samples, units, coverage, null counts and limitations. Complete eligible weather remains in WINDOW MATCHES. Conservative labelled document fields preserve exact supporting text and source names; supplied, explicitly not provided, conflicting and unverified extraction states are distinct. Non-matching text stays available in full and never establishes absence. Applicability/authority still requires source review.
- Both prompt contracts request ordinary Markdown with relevant Facts, Possible impacts, Gaps and Suggestions. React renders assistant Markdown with GFM tables, horizontal table scrolling, safe HTTP(S) links, raw HTML disabled, and remote images replaced with text. User messages remain ordinary text. Streamlit retains Markdown, blocks image tokens at presentation time and preserves original answer text in history.
- The Edge emits one application-owned `ember_scope` NDJSON frame before provider bytes; React displays its metadata separately and retains it with the answer. This avoids header-size limits without buffering the answer. Streamlit displays its own resolved metadata. Neither display certifies model prose. No second model call or per-answer semantic validation was added.

## Local validation

`PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate` passes, including configuration validators, the production build, Python compilation, existing suites, shared window/selection conformance, document facts/gaps parity and actual recording-provider requests through React/Edge and Streamlit. The shared fixtures cover current/stale/missing observations, tonight, today, tomorrow crossing the cutoff, the exact cutoff, later days, historical gaps, midnight, DST and broad forecasts. No model-answer correctness is inferred from recording-provider success.

Browser acceptance passes with a deterministic response fixture and **two chat requests, zero model calls**: progressive text before completion, headings/lists/GFM tables, long-table horizontal scrolling, safe links, blocked HTML and remote images, application metadata from the body frame, Stop retaining the partial answer, and retained prior history. The browser exercised the real local React app. Public map/feed requests were independent of the response fixture; map tiles displayed their existing API-key warning, unrelated to this slice.

Repeat the presentation check with a local dev server and Playwright CLI:

```sh
npm run dev -- --host 127.0.0.1 --port 5181
# In a browser session opened at http://127.0.0.1:5181/:
playwright-cli run-code --filename scripts/verify-cloud-markdown-ui.js
```

Local screenshots are under `output/playwright/cloud-slice-markdown.png` and `cloud-slice-stop.png`. These generated artifacts, installed dependencies and build output are ignored for new files; pre-existing tracked generated files are restored after validation. The production build retains Vite's large-chunk advisory.

The hosted runner passes syntax and a **dry run only**, using an older public capture. That run is not fresh weather or model acceptance. It now accepts `PREVIEW_QUESTION` and `PREVIEW_UPLOAD` overrides and captures emitted server scope as `scope-OBSERVED.json`. Provider egress remains explicitly reconstructed. A live run requires explicit `PREVIEW_URL` and full `PREVIEW_COMMIT`, with deployment identity verified separately.

## Hosted acceptance still required

After user review/commit/push and verification of the resulting preview commit, capture public weather once for the session, including configured observations. Retain raw sources, full enabled KB/uploads, each actual client request, entire visible answer, application metadata, model/provider identity and timing. Reuse the session snapshot for cases while disclosing freshness and changed source revisions. Do not claim exact replay across different revisions.

Run and review each full answer with these representative cases:

| Case | Question/evidence | Review requirement |
| --- | --- | --- |
| Original mixed source | Original facility/plan question with tonight, incident ID, cones, radio and commander | Every section uses the actual night and eligible hourly/grid facts; no later-day leakage or invented authority/thresholds. |
| Rolling near term | Next 24 hours | Exactly 24 elapsed hours from server receipt; hourly/grid only; coverage disclosed. |
| Calendar/cutoff | Today and tomorrow as separate requests | Calendar boundaries remain local; observed/past, near and later segments labelled. |
| Later date | An explicit date beyond receipt + 24 hours | Matching point periods/grid only; original intervals and geography retained. |
| Current/missing | Current conditions, then stale/missing observation evidence | Actual timestamp/station/units/location; unavailable historical/current data stays a gap. |
| Explicit gaps | Plan with labelled unknown/omitted fields and uncertain extraction | Missing is scoped to each source; extraction uncertainty never establishes global absence. |
| Positive/conflicting evidence | Commander, cone specifications/ballast/placement, coordinates and radio authority explicitly supplied; then conflicting sources | Supplied facts and SOPs remain answerable with attribution; conflicts and applicability are disclosed. |

Save a pass/fail reason for every section, table, recommendation and conclusion, checking dates, source values, geography, coverage, uncertainty, operational authority and unsupported thresholds/likelihoods. Keep failed cases open. Option A does not block ordinary chat responses or guarantee future answer correctness.

No commit, push, hosted deployment, environment change, production promotion or local-first branch integration was performed.

Suggested commit: `feat(copilot): scope weather evidence and render grounded Markdown`.
