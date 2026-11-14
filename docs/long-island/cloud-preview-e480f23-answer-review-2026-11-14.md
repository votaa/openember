# Hosted preview answer review — e480f23 — November 14, 2026

**Disposition: FAIL.** Reviewed the complete rendered answer in the user's existing browser session, its application request-scope metadata and the cached NOAA source previews. No new model question was submitted. Runtime code was not changed.

Preview: https://openember-rl3nujpcy-ember-li.vercel.app/

Question: “Using the uploaded plan and enabled KB, explain tonight's weather impacts on this facility. Include CEDAR-731, amber cones, radio channel and incident commander. Give the low, wind and exact forecast URL; distinguish facts from possible impacts.”

The browser showed one attached `synthetic-plan.txt` (5.5 KiB). Its repository counterpart contains `CEDAR-731: 47 amber cones.`, `Late fact: radio channel DELTA-19. No commander supplied.` and `Late evacuation fact: radio channel DELTA-19; no incident commander is specified.` It supplies no facility coordinates, cone weight/ballast/placement, operational thresholds, radio-use authority or command-assignment status outside the document.

## Observed application metadata

- Receipt: `2026-11-14T20:36:29Z` / `2026-11-14T15:36:29-05:00`.
- Resolved night: `2026-11-14T18:00:00-05:00` to `2026-11-15T06:00:00-05:00` (`23:00Z` to `11:00Z`). Resolution method: source period.
- Selected segment: hourly and grid. Point forecast values: not eligible for this segment.
- Hourly: complete temporal coverage, fetched `2026-11-14T20:36:28.756Z`, source updated `2026-11-14T20:31:02+00:00`.
- Grid: fetched `2026-11-14T20:36:28.756Z`, source updated `2026-11-14T18:20:27+00:00`. Wind/gust and most fields have complete temporal coverage; min/max temperature fields are partial.
- JFK observation timestamp: `2026-11-14T20:00:00+00:00`, retained separately from forecast evidence.

These are observed application-owned metadata, not observed provider egress or certification of model interpretation.

## Whole-answer review

| Section | Result and reasoning |
| --- | --- |
| Facts: uploaded inventory and radio | Correctly recovers CEDAR-731, 47 amber cones and DELTA-19. Inventory is not evidence of deployment. The document does not independently establish that CEDAR-731 is a facility identifier. |
| Facts: commander | Initially correct: no commander is named in this plan. Later sections contradict this source-scoped unknown. |
| Facts: hourly weather | Correct source URL and generally consistent 44°F to 36°F/hourly-wind narrative. The 36°F value needs the explicit label “minimum in the supplied hourly forecast for the requested interval,” rather than implying a published nighttime low. Exact original hourly revision was not replayed; see limitations below. |
| Facts: tides/current water | FAIL as evidence for tonight. Answer lists Battery lows at 04:41 and 17:41 on November 14; both precede the 18:00 start. It also lists 15:24 water observations, which are current background, not forecasts for tonight. |
| Possible impacts: cones | Conditional displacement of unsecured cones can be discussed, but “Cones are lightweight” is unsupported by this plan. No specifications or deployment evidence establish actual stability or which cones need securing. |
| Possible impacts: precipitation | FAIL: low precipitation probability is used to establish “rain-related flooding unlikely.” Site location, drainage, rainfall amounts and applicable flood evidence are unknown. |
| Possible impacts: coastal flooding/surge | FAIL: uses the out-of-window 04:41 low to claim “lowering immediate flood risk” and that surge must be “substantial to overcome the low.” Neither the time applicability nor facility/gauge applicability or a surge threshold is established. |
| Possible impacts: communication | FAIL: “absence is a procedural gap” treats a missing name in one plan as absence of an assigned commander. DELTA-19 being listed also does not establish authority to use/test it. |
| Gaps | Location and cone-specification gaps are useful. FAIL: “Without a commander” changes an unknown assignment into a confirmed absence. A later location caveat does not repair earlier site-specific flood-risk claims. |
| Suggestions: cones | “Ensure all 47” assumes the inventory is deployed and introduces a 16 mph action trigger without an applicable equipment/SOP basis. Verification of deployed equipment and applicable procedures is the supported starting point. |
| Suggestions: command/radio | FAIL: “Designate an incident commander ASAP” presumes a vacancy and authority to appoint. The source supports verifying the existing assignment and authorized communications procedure. |
| Suggestions: water | FAIL: “alert if water rises > 1 ft above the low-tide mark” invents an operational trigger. No supplied procedure, applicable gauge threshold or facility elevation establishes it. |
| Suggestions: reassessment | Monitoring/reassessment may be proposed as a suggestion, but timing and gust/direction statements must remain tied to eligible intervals without implying an exclusive peak or unsupported asset threshold. |
| Closing assurance | FAIL: “All weather facts ... for the specified window” conflicts with its own morning/afternoon tide and water timestamps. “No additional assumptions” conflicts with invented thresholds, cone characteristics, flood likelihoods and command absence. |
| Presentation | Markdown sections, lists, tables, source links and separate application metadata are present. This is presentation success, not factual acceptance. |

## Source comparison limits

Public hourly and grid feeds were retrieved once after the browser review into `/private/tmp/openember-review-e480f23/`. The comparison hourly response reports `2026-11-14T18:20:27+00:00`, differing from the browser's `20:31:02+00:00` hourly revision; it cannot establish a byte-identical replay of the question's evidence. Its selected hourly rows are 44°F down to 36°F, W 8 mph then W 7 mph at 01:00 and NW 8 mph after 02:00. This supports only a limited consistency check, not certification of every original numerical claim.

The comparison grid reports the same published update time as the browser metadata (`18:20:27+00:00`); that is still not a retained hash of the original request. Selected gust intervals contain 24.076 and 25.928 km/h. The model's 23:00–02:00 wording does not faithfully describe the complete original grid intervals and must not be treated as an exclusive gust period. A separate public NOAA tide request returned HTTP 400; no replacement tide evidence was inferred. The cached browser preview itself showed the November 14 04:41 low, sufficient to establish that this cited time precedes tonight's resolved start.

Original client request, complete original source snapshots, original model Markdown, provider request/egress and response timing were not captured for this user-run answer. This review uses the full rendered answer and observed application metadata; it does not claim those missing artifacts exist or reconstruct them as observed.

## Next corrective scope

Keep this acceptance case failed. Distinguish current tide/water observations from requested future conditions before synthesis, and prevent unrelated/out-of-window CO-OPS evidence from being treated as facility-specific flood evidence. Preserve source-scoped unknowns and applicable operational authority throughout every section. Inventory, precipitation probability and conditional wording cannot supply missing equipment thresholds, flood likelihoods or command assignments. Whole-answer acceptance remains required after any corrective implementation; formatting/prompt tests alone cannot close these findings.

The user-authorized [bounded corrective scope and acceptance criteria](cloud-grounding-corrective-scope-2026-11-14.md) now record the explicit expansion beyond option A, including controlled operational output, missing/supplied evidence tests and repeated hosted runs with exact source/request captures. That scope is not an implementation or a passing retest. This run remains **FAIL**.

Suggested commit: `test(copilot): record hosted preview answer review failures`.
