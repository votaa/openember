# Local synthesis grounding and conciseness follow-up

Date: November 13, 2026 (America/New_York).

Release decision: keep hybrid experimental and the default execution mode on `legacy`. Prompt enforcement and evidence retention are distinct from native answer quality. This change does not establish operational readiness.

## Problem and change

The phase 5 retained answers converted a 20% precipitation probability into no rain/no risk, an unspecified commander into an unassigned commander, and missing alert evidence into zero active alerts. Broad answers also repeated large portions of the KB, increasing generation time and introducing additional unsupported details.

The shared `grounded-local-v2` response policy now ends the local system message after evidence and coverage in both runtimes. It explicitly distinguishes unknown from absent, requires source support for alert and operating status, preserves precipitation probabilities, and asks for conditional impacts. Worked wording examples illustrate the required distinctions and are explicitly marked as illustrations rather than evidence.

The output guidance requests concise Facts, Possible impacts and Gaps only where relevant, aiming for 250 words while allowing additional detail for requested coverage. There is no hard generation cutoff, answer rewriting, dropped enabled KB content, changed model configuration or changed cloud/legacy prompt.

## Regression fixtures and reproducibility

`shared/copilot/fixtures/grounding-regressions.json` retains the exact three phase 5 benchmark questions, excerpts of the actual failed answers and review requirements. The benchmark now reads these questions directly and accepts an optional `hybrid` arm selector; existing two-arm invocations still work. The input fixture hashes must match the phase 5 workload hashes when comparing results.

Both runtime context tests exercise these questions, retain the full enabled KB and selected feature, preserve the forecast probability and source, and retain the mixed/broad document facts, including the late radio channel. Existing cross-runtime projections compare complete messages and accounting. Existing recording-provider checks protect the original full cloud prompt and fallback policy.

A diagnostic screening helper flags familiar precipitation, assignment, alert and reassurance phrases for review. Tests run it against actual phase 5 failures. Its matches may include quoted or negated claims and it can miss other errors. Every screened answer still requires manual review; an empty flag list is never an acceptance verdict. It does not filter application output.

Reproduce from the repository root using the existing Python virtual environment:

```sh
PATH="$PWD/.venv/bin:$PATH" npm run local-first:gate
node scripts/benchmark-copilot-acceptance.js /private/tmp/copilot-grounding 3 hybrid
```

Native inference uses only the installed local model and retained public/synthetic November 11 sources. These are historical test inputs, not current operational findings. No cloud request or model download is involved. Preserve the same manual quality rubric after a prompt change; transport and token checks alone cannot establish correctness.

## Validation results

The complete regression gate passed: 317 JavaScript checks and 164 Python tests, configuration validators, production web build, compilation and diff checks. A final focused context run passed 25 JavaScript checks and 5 Python tests, including one added diagnostic check (318 distinct JavaScript checks overall). The project virtual environment supplies Python dependencies. The HTTP transport tests require local loopback access. Generated dist changes were restored.

The [machine-readable results](copilot-grounding-results-2026-11-13.json) retain all nine final native answers, metrics, log evidence, fixture/message hashes, policy and per-answer manual review. The initial draft prompt produced one complete weather answer that still failed grounding; its next mixed request was interrupted. Those draft records are retained separately and excluded from the final matrix.

| Workload | Input tokens v1 → v2 | Mean first answer v1 → v2 | Mean completion v1 → v2 | Mean words v1 → v2 |
| --- | ---: | ---: | ---: | ---: |
| weather | 4,217 → 4,716 | 38.1 → 37.9 s | 95.0 → 67.2 s | 403 → 198 |
| mixed | 4,817 → 5,316 | 45.6 → 45.2 s | 145.8 → 73.8 s | 588 → 222 |
| broad | 5,208 → 5,707 | 47.3 → 52.3 s | 321.8 → 115.0 s | 1524 → 393 |

Three sequential cold samples per workload use the same installed model, 32,768 context, thinking off and automatic unloading as phase 5. Native input increases by 499 tokens for the new guidance. Every sample has one local generation, no cached input, explicit no-truncation evidence and a natural stop. All workload fixture hashes and included evidence IDs match phase 5. The legacy arm was not rerun because its prompt was unchanged. This is a historical comparison on the same desktop, with uncontrolled thermals and background load; it does not establish causal or general latency guarantees.

Mean completion falls by 29.2% (weather), 49.4% (mixed), 64.3% (broad). Answers are substantially shorter, though broad coverage can exceed the soft 250-word aim. All nine samples still miss both the 30-second first-answer and 60-second completion targets.

**Manual native grounding review: 0/9 pass.** Weather samples still equate 20% precipitation with no precipitation or provide unsupported operational reassurance. Mixed samples retain the plan identifiers, cones and late radio channel but still convert an unspecified commander into unassigned/absent, sometimes contradicting themselves. Broad samples invent active station status or alert absence, confuse complaints with outages, and omit requested evidence or misstate KB/forecast details. A later disclaimer does not repair an earlier false claim. See each answer's findings in the results artifact.

The JavaScript native coordinator was measured; Python equality is established through context/message conformance tests. Docker packaging and browser acceptance were not repeated in this focused follow-up. Live cloud answer acceptance remains pending. No cloud inference, model download, environment-file edit, hosted deployment, commit or push was performed.

Final cleanup confirms Ollama has no loaded models. The installed model digest and Ollama version match phase 5. Weekly usage is 70% remaining, above the plan's stop threshold.

## Next decision

This slice improves conciseness and makes the grounding requirements and failed cases reviewable. Prompt guidance alone has not made the installed 4B model reliable on these analytical workloads. Keep the quality gate unchanged and hybrid experimental. The next separately scoped experiment should compare another model/runtime available within the hardware limit against these same fixtures, rather than promoting this prompt or relaxing the rubric.

Suggested commit: `fix(copilot): strengthen local grounding and conciseness guidance`.
