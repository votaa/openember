# Qwen3 8B mixed-source smoke test

Date: November 13, 2026 (America/New_York). Base commit: `c3b2d62`.

**Decision: this 32K-context smoke case fails grounding and incurs substantial host memory pressure. Do not advance to the full 8B matrix on this evidence. Keep hybrid experimental and legacy default.**

## Scope and method

Ran exactly one cold `qwen3:8b` Q4_K_M mixed-source generation through the real JavaScript Copilot coordinator, using the current `grounded-local-v2` prompt. Model digest: `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`. Ollama uses the installed model, local-only routing, no cloud key, thinking off, 32,768 context and automatic unloading. No prewarming generation was submitted.

The exact phase 5 mixed question asks about the uploaded plan, enabled KB, tonight's weather and selected facility, including CEDAR-731, cones, radio channel and commander. Fixture hash, complete message hash and included source IDs match the prior 4B v2 case exactly. All five enabled KB modules, the selected facility, forecast and late document passage remain included. Retained public/synthetic November 11 sources are historical test inputs, not current operational findings.

A temporary copy of the existing acceptance runner filters workloads to `mixed` and samples host memory and `/api/ps` every five seconds. Its complete source, raw answer, native logs, memory samples and review are retained in the [results artifact](copilot-8b-mixed-smoke-results-2026-11-13.json). Application code, environment files and model defaults were not changed.

## Results

| Check | Observation |
| --- | --- |
| Native input retention | Pass: 5,324 input tokens, zero cached input, native 32,768 allocation and explicit no-truncation evidence |
| Transport | Pass: one local generation, natural `stop`, automatic completion |
| First answer | 73.1 s |
| Completion | 125.4 s |
| Native model load | 7.95 s |
| Native prompt processing | 64.76 s |
| Native generation | 52.33 s; 355 output tokens |
| Commander accuracy | Fail: unspecified becomes absent in impact reasoning |
| Precipitation accuracy | Fail: supplied 20% probability described as not provided |
| Plan identifiers and counts | CEDAR-731, 47 amber cones and DELTA-19 retained |
| Forecast low, wind and URL | 44°F, 7–10 mph W and exact source URL retained |

The answer first says the commander is not specified, then says “the absence of an incident commander could lead to potential coordination challenges.” That treats missing information as evidence of absence. Its final unknown-assignment statement does not undo the earlier inference.

It also says “precipitation probability for the forecast period is not provided.” The source period's `probabilityOfPrecipitation.value` is 20, present in the same complete prompt used by the 4B run. This is an answer-quality error, not a selector or native truncation failure.

For context, the three prior 4B v2 mixed samples averaged 45.2 s to first answer and 73.8 s to completion. This one 8B sample takes 73.1/125.4 s and still misses the 30/60-second working targets. One sample with uncontrolled host load cannot establish a general model performance ranking.

## Memory

The host has 16 GiB unified memory. Ollama reports **9.25 GiB** allocated for the loaded 8B model at 32K context, entirely in GPU/unified memory.

- Baseline swap used: 5.37 GiB.
- Peak sampled swap used: 9.15 GiB; increase of **3.78 GiB** during this shared-desktop run.
- Loading briefly reaches host memory pressure level 4 (critical), then samples show level 2 (warning) while inference is active. The minimum reported system-wide free percentage is 6%.
- After automatic model unloading, `/api/ps` is empty, pressure returns to level 1 (normal), reported free percentage is 76%, and swap used is 7,249.06 MiB. Used swap need not immediately return to its baseline.

These figures describe periodic host-level observations, not isolated process memory or a guarantee that no larger transient peak occurred. The desktop already had substantial swap use before the test.

## Follow-up boundary

This single case does not justify the full repeated 8B matrix. A separately scoped smaller-context 8B experiment could reduce memory allocation, but it must first prove the same evidence survives both application budgeting and native token retention; silently omitting evidence to fit would invalidate the comparison. No smaller-context run was performed here.

No cloud request, model download, additional inference sample, hosted deployment, commit or push was performed. The 8B model was unloaded after the test.

Suggested commit: `test(copilot): record 8B mixed-source smoke results`.
