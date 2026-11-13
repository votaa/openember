# Phase 5 — acceptance and performance validation

Validation date: November 12, 2026 (America/New_York; raw timestamps use UTC).

**Release decision: keep hybrid experimental and default execution on `legacy`.** Native input retention and deterministic construction are separate from answer quality. The installed 4B model produces unsupported conclusions even when the necessary facts survive context selection. Passing fast queries or reducing input does not close this grounding gate. Live cloud answer acceptance is also pending separate authorization.

## Scope and reproducibility

The native matrix uses the installed `qwen3:4b-instruct` Q4_K_M model, digest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, on a MacBookAir10,1 with 16 GiB RAM, macOS 27.2.1 and Ollama 0.40.16. Both arms explicitly use local-only routing, an empty cloud key, 32,768 context, thinking off and automatic unloading. Node is 20.1.0; host Python is 3.11.2. Native `/api/ps` reported 7,556,321,771 model bytes entirely in GPU memory at the requested context allocation.

Workloads use retained public/synthetic November 11 snapshots; they are **historical test inputs, not current operational information**. Five enabled KB modules, a point forecast, an uploaded synthetic plan, complete map/311 counts, a selected synthetic facility, and supplemental grid/catalog evidence are retained. The repeated matrix defines a smaller fixed synthetic catalog than the 120 KB stress fixture; both its raw and text representations contain the same 200 public synthetic catalog entries. Two interrupted fixture-sizing preflights are excluded from the results. No acceptance threshold was changed in response to an answer.

Legacy messages come from the production React context/system-prompt builders exercised by `tests/helpers/copilot-legacy.js`, with the same selected-feature snapshot appended explicitly. Hybrid requests pass through `createCopilot.stream`, including planning, context construction, actual provider discovery and one native generation attempt. Both arms use identical questions and underlying retained sources. Legacy retains its existing opening-upload excerpt; hybrid's access to a later passage is an intentional retrieval improvement, not a claim of byte-identical prompts. This native comparison measures the JavaScript coordinator; JavaScript/Python context conformance and separate browser/runtime checks establish other boundaries.

Reproduce the cached and native measurements from the repository root:

```sh
node scripts/benchmark-copilot-direct.js /private/tmp/copilot-direct.json
node scripts/benchmark-copilot-acceptance.js /private/tmp/copilot-native 3
```

The native runner never reads `.env`, calls cloud or downloads a model. It refuses to start when a model is already loaded. Requests are sequential, each requests unloading, and arm order alternates by sample. The runner records message/fixture hashes, actual native input counts, cache/truncation log evidence, first answer, native prompt/generation time and final coordinator completion. SIGINT/SIGTERM abort the current request and prevent another submission. Review answer quality separately from the runner's transport/retention verdict.

The user's running application services and other Docker workloads remain in place. Separate acceptance containers and browser activity share this desktop during measurements; thermals, memory pressure and background activity are not controlled. Reported times describe this environment, not a universal SLA or an isolated hardware comparison. Source acquisition, browser paint, and UI synchronization are not included in coordinator native timing.

## Regression and compatibility

The final `local-first:gate` passes, including the new `test:copilot-acceptance` suite: 314 JavaScript checks and 163 Python tests, plus configuration validators, production build, compilation and diff checks. The Python acceptance test also exercises 22 scenario/provider-policy subtests. Existing suites retain route precedence, negation, compound questions, day/night/DST, zero/partial/hidden populations, exact citations, cancellation, first-frame commitment, fallback, immutable worker state, forced reruns and automatic completion coverage.

The new compatibility matrix runs all 11 legacy scenarios in both cloud-only and local-first pre-stream-failure modes, separately through the real React HTTP client/adapter and the Streamlit application/provider loop. Recording providers verify the complete original system prompt remains an unchanged prefix of cloud messages, every enabled module survives, disabled modules stay absent, the original question survives, there is one full-context acquisition and exactly one generation per permitted attempt. Scenarios cover each module, a configured custom extension with a late fact, whole-KB and implicit KB inquiries, cross-source analysis, disabled selection and follow-ups. Existing baselines preserve each interface's API/NOAA/tidal/catalog differences. These are construction checks, **not live cloud answer-quality evidence**.

The compatibility matrix explicitly requests model answers and uses a mock 65,536 local allocation to accommodate its large custom module. This is not a proposed native setting. At the ordinary 32K allocation, that large mandatory KB can correctly trigger an explicit processing limitation without automatic cloud spending. Existing mandatory-overflow fixtures enforce that boundary. Ordinary automatic follow-ups may correctly take a direct route; a model preference must remain available.

Separate configured-source acceptance checks use the current generated jurisdiction registry with the retained synthetic 311 aggregates. Both UI snapshot builders and application delivery paths preserve the exact configured Socrata endpoint, full Rockaway filter, all four counts including zero, original report interval/timezone, fetch time and complaint-versus-confirmed-outage limitation, without a provider call.

## Deterministic measurements

Thirty cached samples each cover forecast, complete map totals, 311 aggregates, hidden layers, incomplete 311 aggregates and ambiguous layers. The production JavaScript HTTP adapter/client makes zero provider generation **and discovery** calls in all 180 turns. Median service times were 6.5–25.8 ms; the largest observed sample was 159.9 ms. These are in-process transport measurements, not Send-to-paint timings.

The packaged Python image, with networking disabled and only a fixture/harness mount, also completes all 180 turns without provider calls or fake provider frames. Median service times were 1.4–13.2 ms and the largest sample was 525.1 ms. Each turn has exactly one terminal completion and the correct answered/unsupported/clarification status. The packaged React HTTP server separately passes these same six scenarios through actual loopback HTTP with inference unavailable and an empty key.

## Native performance and quality

The [machine-readable results](copilot-phase-5-results-2026-11-12.json) retain all 18 public/synthetic answers, native metrics/log evidence, request hashes, scope metadata and deterministic timing samples. Each workload/arm has three sequential cold-model samples. Every sample has exactly one local generation, zero cached input tokens, a 32,768-token native allocation, explicit no-truncation evidence and a natural `stop` completion. Repeated input-message and fixture hashes match within every workload/arm.

| Workload / arm | Native input tokens | Mean first answer | Mean completion | Completion range |
| --- | ---: | ---: | ---: | ---: |
| Weather / legacy | 8,453 | 84.9 s | 149.9 s | 132.5–173.8 s |
| Weather / hybrid | 4,217 | 38.1 s | 95.0 s | 80.0–119.0 s |
| Plan + weather + facility / legacy | 8,466 | 87.9 s | 199.7 s | 178.7–236.4 s |
| Plan + weather + facility / hybrid | 4,817 | 45.6 s | 145.8 s | 109.8–185.5 s |
| Broad assessment / legacy | 8,452 | 89.2 s | 325.6 s | 253.5–431.1 s |
| Broad assessment / hybrid | 5,208 | 47.3 s | 321.8 s | 272.8–378.4 s |

Hybrid reduces input by **50.1%, 43.1% and 38.4%** respectively. Mean native prompt processing falls from 81.7/84.2/86.0 s to 35.1/41.8/44.5 s. Weather and mixed-source mean completion improve by 36.7% and 27.0% in these samples. Broad completion is essentially unchanged within the observed variation: hybrid generates 2,569–3,636 output tokens versus legacy's 1,929–2,982, offsetting much of the input-processing benefit. Three samples and uncontrolled desktop conditions do not establish a general latency guarantee.

**All nine hybrid samples miss both the 30-second first-answer and 60-second completion goals.** Fewer input tokens and successful native retention do not make these answers accepted for operational use.

The rubric requires faithful forecast temperature/wind/time/URL handling; no unsupported absence-of-risk claims; preservation of `CEDAR-731` and 47 amber cones; an explicitly unknown commander rather than an assertion that no commander is assigned; and broad answers that distinguish source coverage and samples from confirmed populations. Hybrid must recover the retrieved late `DELTA-19` passage. Legacy's opening excerpt does not contain that passage, so a truthful limitation is correct for that arm; inventing a channel would fail. Literal presence checks supplement manual review and cannot establish grounding by themselves.

Early weather answers in both arms retain 44°F, 7–10 mph W and the exact NWS URL, but infer no rain/no immediate risk from a forecast containing a 20% precipitation probability. The first legacy mixed answer incorrectly says CEDAR-731 and cones are absent despite their presence in the opening excerpt. The first hybrid mixed answer recovers the cones and late radio channel, then treats an unspecified commander as an unassigned commander and makes unsupported safety/alert conclusions. These are acceptance failures even when transport, native retention and keyword checks pass.

## Packaged browser delivery

Both Docker targets build and load their runtime modules and shared policy/schema from the images. Isolated services use ports 3055 and 8555/8556; the existing user services are not recreated. The unavailable-provider runs use local-only, an empty key and an unreachable inference endpoint. React and Streamlit automatically deliver explicitly labeled failed rule-based fallbacks and restore an enabled input. Direct forecast answers preserve the exact low, wind range/direction, original offsets, URL and fetch time while inference is unavailable.

React's synthetic forecast route leaves unrelated hourly acquisition unresolved; the direct answer still completes. The test-owned Streamlit network harness returns a point forecast after 250 ms and makes unrelated external feeds unavailable. This isolates on-demand acquisition and delivery, not live upstream availability. Its fresh answer reports 0.75 s evidence acquisition / 0.07 s local execution; subsequent cached answers report about 0.05 s evidence / 0.04 s execution. Visible browser delivery is a separate measurement.

A local synthetic streaming provider verifies the grounded response label, automatic completion and enabled input. Captured React and Streamlit requests contain all five complete enabled KB modules. React Stop before commitment leaves no invented provider identity; Stop after partial content preserves that content and shows cancelled status with enabled input. Streamlit's menu Rerun occurs at `2026-11-13T02:54:32.408Z`, after its request starts at `02:54:31.272Z` and before terminal delivery at `02:55:02.042Z`; the provider records one request for that turn and completion is automatic. These synthetic streams establish delivery behavior, not native answer quality.

During simultaneous native benchmarking, the observed cached React forecast turn takes 2.47 s and a cached Streamlit turn takes 6.65 s, missing the one-second visible-delivery target. Their in-process and worker times are much shorter. Native inference/background desktop load is material to these observations; they must not be presented as idle Send-to-paint performance.

With inference idle, three cached browser turns take **336/139/139 ms in React** and **974/928/588 ms in Streamlit**, all under one second, with the input restored after every turn. Ollama's loaded-model list stays empty. Streamlit's first on-demand turn takes 1,586 ms including the controlled 250 ms source fetch. This meets the cached-data working target in this small idle sample set; it does not establish a guarantee under simultaneous native inference.

Both packaged interfaces also run the real installed model through a local capture proxy for a concise uploaded-plan question. Their captured inputs retain all five enabled KB modules, one document and the late `DELTA-19` passage. React uses 6,250 native input tokens and completes native generation in 50.86 s; Streamlit uses 6,210 and completes in 51.43 s. Both stop naturally with zero cached tokens and native no-truncation evidence. Their visible final answers correctly report CEDAR-731, 47 cones, DELTA-19 and that the document does not name a commander; React restores Send and Streamlit restores input automatically.

For the real Streamlit case, the provider receives one request at `03:40:13.704Z`; menu Rerun occurs at `03:40:30.602Z` during prompt processing; that same request finishes at `03:41:05.148Z`. No generation is replayed. The final UI retains `UI sync 0.1s` across the rerun. These native document checks establish actual browser/worker delivery and factual retrieval for this case; they do not override the failed broad-analysis grounding gate. Native browser request durations above are not comparative Send-to-paint measurements.

## Promotion gates

| Gate | Decision |
| --- | --- |
| Existing regression and shared semantic conformance | Pass |
| Complete cloud prompt/evidence construction and allowed fallback | Pass with recording providers |
| Direct queries independent of provider availability | Pass |
| Native full input retention | Pass for all 18 samples |
| Grounded native answer quality | Fail; keep experimental |
| 30-second first-answer / 60-second completion usability goals | Fail for all nine hybrid samples |
| Browser direct-query Send-to-completion target | Pass for all six idle cached samples; misses under simultaneous inference load |
| Packaged native browser delivery and real Streamlit rerun | Pass for the retained document case in both interfaces |
| Live cloud model capability/answer acceptance | Pending explicit authorization |
| Hosted promotion | Not approved by this validation |

Before promotion, address unknown-versus-absent grounding for precipitation, alerts, infrastructure status and incident assignments, and evaluate response verbosity while preserving requested coverage. Re-run these same fixed workloads and the quality rubric after any change. Any smaller native context allocation needs its own input-retention validation; a smaller estimated prompt does not itself prove that a smaller allocation is safe.

Cleanup is complete: the isolated browser, test services and capture proxy are stopped, Ollama reports no loaded model, and the original React/Streamlit containers remain healthy on ports 3000/8501. Generated build artifacts are restored. Final weekly usage is 73% remaining, above the plan's 10% stop threshold.

No hosted release, environment-file edit, model download, paid cloud request, commit or push is included. Suggested commit: `test(copilot): validate acceptance parity and native performance`.
