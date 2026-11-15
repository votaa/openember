# Focused response correction — local review candidate

Base: `88d2199` on `codex/cloud-upload-coverage`. Status: local implementation and verification complete; uncommitted. **Hosted acceptance remains FAIL and GROUND-001/002/003 remain open.** This follows the [corrective scope](cloud-grounding-corrective-scope-2026-11-14.md) and the [failed repeated hosted matrix](cloud-grounding-9862a66-acceptance-2026-11-15.md).

## Change and boundaries

Both React and Streamlit now render application-owned, query-relevant evidence records. The model selects optional record IDs in an `operational-answer-v2` envelope; required matching records render independently. Unknown IDs, malformed envelopes and interrupted output cannot become arbitrary answer prose. The source document protocol remains `operational-evidence-v1`: these are separate versions with separate purposes.

Raw KB paragraphs no longer appear as selectable references in the answer. Complete enabled KB and upload text remain provider inputs, and a collapsed **Request sources (raw)** viewer retains the request's original text separately from the answer and metadata. This closes the observed reference-text path around operational validation. Plain policy labels and imperative inventory text cannot re-enter Facts or Gaps as verified records. Query topic cues select relevance; they do not verify arbitrary prose. Numeric triggers and mandatory actions still require applicable, source-scoped operational evidence, with conflicts withheld.

The prompt now explicitly treats the emergency-management role as domain context. An enabled hazard module does not make that hazard relevant to every question. Empty sections and unconditional all-domain recommendations are omitted. Current-measurement questions exclude forecast summaries and unrelated cone impacts; commander-only questions exclude radio actions; radio-only questions exclude water thresholds. Supported names, inventory versus deployment, ballast, placement, channel, applicable thresholds and authorized procedures remain answerable when relevant.

“Current measured conditions” now selects current observations. React fetches the same eight configured NWS stations as Streamlit. Regional questions select eligible configured stations and disclose selected coverage; KJFK/KLGA/KBDR are labelled regional references. Named-station questions select that station without substituting another. Existing observation age, coordinate and source-age checks remain; the current NWS window is one elapsed hour and CO-OPS freshness remains 18 minutes. This does not implement nearest-station routing for arbitrary point locations, nor request every NOAA station. A regional observation does not establish conditions at an unspecified facility.

The renderer supports bounded typed facts and deterministic weather summaries. It is not a general interpreter of every KB paragraph. Questions needing an unrepresented document fact receive a source-review gap and access to full text. This usability limitation must be reviewed in hosted acceptance; retaining all inputs alone does not prove broad inquiry quality. Unstructured authority or succession text requires source review rather than being silently treated as an authorized procedure.

## Local evidence

- `PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate` passed: 175 JavaScript checks and 141 Python test runs, including shared-suite repetitions. Config validation, build, phase checks, Python compilation and whitespace validation passed.
- New regression tests replay all 15 retained hosted cases at their original receipt times, compare JavaScript/Python evidence and rendering, and exercise the reference bypass, current-observation selection, missing/stale/named stations, relevance and positive evidence preservation.
- [Local projections](acceptance/focused-local-2026-11-15/replay-summary.json) range from 64 to 237 words. These select available optional records deterministically; they are **not new model responses or hosted acceptance**. The recorded hosted answers ranged from 1,092 to 1,894 words.
- A fixed-clock local recording-provider browser check passed four requests with zero cloud model calls: supported facts/procedures, raw-source inspection and initial collapse, two eligible regional stations and 2-of-8 coverage, current-answer relevance, malformed-output containment, Stop and retained history. React rendering was visually inspected. Streamlit parity is covered by tests and compilation, not a new Streamlit browser walkthrough.
- [Machine-readable local check record](acceptance/focused-local-2026-11-15/checks.json). Full gate output is retained alongside it. No deployment, commit, push or real cloud generation was performed for this candidate.

## Review and hosted retest

Review and commit this worktree, then push through the existing Git preview workflow. Suggested commit: `fix(copilot): focus answers on relevant validated evidence`.

Verify the resulting preview commit before collecting a fresh source session. Repeat missing, supplied and conflicting cases at least three times, plus current/regional, named-station, rolling/later-window, missing and stale-source cases. Retain exact source snapshots, actual provider request and complete answer, application scope, model identity and timings. Review every rendered section for relevance, unsupported claims, preserved supported facts, source copying and incomplete output. The preparation script now explicitly asks about applicable thresholds and procedures in supplied/conflicting variants; retain original questions as well so positive evidence and relevance are assessed separately.

A valid envelope or a single good answer does not close acceptance. Keep the failed hosted disposition until the new repeated results satisfy the original acceptance contract and these relevance requirements.
