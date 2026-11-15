# Emergency assessment KB correction

Base: `79d3ec6`, branch `codex/cloud-upload-coverage`, checkout `/private/tmp/openember-cloud-upload`. Local review candidate; **hosted acceptance remains FAIL**.

The KFRG map-generated question asks for emergency considerations. Returning only a measured-weather summary and gaps fails that intent, even when the map observation reaches chat correctly. The previous local browser test checked weather preservation and absence of unrequested policy text; it did not require a substantive KB answer. This correction replaces that inadequate assertion with positive KB coverage checks.

## Behavior

Pure current-weather measurement requests retain the direct observation path. Emergency assessments and impact questions use the existing controlled provider route. Requests that include contextual KB records also cannot take the observation shortcut. The generated map question remains an emergency-considerations question; it is not rewritten to conceal the failure by asking only for weather.

The controlled renderer now supports a separate **Regional KB context** section. For the supplied, enabled configured Long Island KB revisions, an emergency assessment includes:

- Flood-zone examples, explicitly distinguished from a zone assignment to the selected site.
- Evacuation-related shelter and access-route references, with opening, availability and site membership left unconfirmed.
- Named critical medical facilities, attributed as regional KB examples without inventing nearest-facility rankings or current capacity.
- Regional OEM contacts, without inferring command assignment or authority.

The KFRG observation, time, wind, gusts, direction and source remain in Facts. Site applicability and airport operating limitations remain explicit. Mandatory evacuation rules and heat-index triggers in the raw KB do not become operational directions through the contextual records. Applicable numeric thresholds and mandatory actions retain their source-scoped operational-record checks.

## Implementation boundary

This is a bounded extension of the existing controlled-record architecture, not a verifier for arbitrary model prose. `shared/kb-context-records.json` contains application-reviewed summaries and complete source-module revisions. JS/Python require the corresponding enabled module's complete normalized text to match that revision before exposing a contextual record. The model can select record IDs; the essential emergency-context records render independently of an empty optional selection. No source paragraph or model-generated narrative can bypass the operational gate.

Uploaded copies cannot impersonate enabled KB modules. Disabled modules do not contribute remembered facts. Edited module text receives a source-revision review gap rather than an old summary. This means **custom or newly edited KB revisions need reviewed contextual records before this path can summarize them**. Full source text remains inspectable and remains available to the provider. This limitation is material: this candidate addresses the current configured KB and map-generated request; it does not establish unrestricted KB interpretation or site-specific geographic applicability. It must not be described as complete general KB synthesis.

## Local validation

New tests failed before the correction for emergency KB coverage and changed-source handling. Regression coverage now includes the exact KFRG generated question, a generic creek map feature, pure weather requests, explicit critical-facility requests, disabled modules, edited revisions, an uploaded KB copy, unsupported policy withholding, and JavaScript/Python parity. Existing KFRG tests now require the controlled assessment route rather than a direct weather-only answer.

The local recording-provider browser check exercised the actual KFRG marker → **Send to Chat** control. The visible answer contains flooding, evacuation references, named critical facilities and contacts, while retaining observation provenance and collapsed raw sources. The typed weather request stays weather-only. Two chat requests used one local recording-provider call and zero cloud generations. The recording provider returned an empty optional record selection; this validates rendering and routing, not live model reasoning or hosted acceptance. The recorded map answer is 297 words. Streamlit has parity and compilation coverage, not a new browser walkthrough.

The full phase-4 gate passed: **188 JavaScript checks and 151 Python test runs**, including shared-suite repetitions, configuration validation, build, compilation and whitespace checks.

See [complete browser evidence](acceptance/emergency-kb-local-2026-11-15/browser-results.json), [map answer](acceptance/emergency-kb-local-2026-11-15/map-answer.md), [typed weather answer](acceptance/emergency-kb-local-2026-11-15/typed-answer.md), and [phase-4 gate output](acceptance/emergency-kb-local-2026-11-15/phase4-gate.log).

No commit, push, deployment or cloud generation was performed for this candidate. Suggested commit: `fix(copilot): include KB context in emergency assessments`.

## Hosted acceptance

After review, commit and push, verify the new preview commit. Repeat the typed weather request and the KFRG marker-generated emergency assessment at least three times each. Review the complete answers for substantive enabled-KB coverage, concise presentation, retained station provenance and geographic limits, and absence of unsupported operational directions. Repeat with disabled and edited modules, another map feature, and the existing missing/supplied/conflicting operational-evidence cases. Capture exact client inputs, source revisions, actual provider request/output when called, model, timing and application metadata. One well-formatted or useful response does not close the failures.

The grounding tracker remains open pending those repeated hosted results and review of the revision-support limitation above.
