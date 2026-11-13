# Complete cloud uploads within explicit limits

Development branch: `codex/cloud-upload-coverage`, based on production `main` at `4b159c92b9fd73f66bece1489572a248585d29be`.

## Behavior

React/Vercel and Streamlit now include the full decoded text of accepted documents in their cloud prompts. The previous silent first-4,000-character excerpt is removed. Each document is labeled with its filename, complete coverage and UTF-8 byte count. The enabled KB, live-source context and the existing recent-history selection stay in the request. There is no retrieval or automatic source removal in this change.

| Limit | Supported behavior |
| --- | --- |
| File types | `.txt`, `.csv`, `.json`, `.geojson`, `.md`; UTF-8, optional UTF-8 BOM |
| Each file | At most 65,536 bytes (64 KiB) |
| Attached extracted text | At most 131,072 UTF-8 bytes (128 KiB) total |
| File count | At most 8, with distinct filenames |
| Complete cloud prompt | At most 98,304 UTF-8 bytes (96 KiB), including system rules, KB, documents, live sources and recent chat |
| API wire request | At most 1,048,576 bytes (1 MiB), checked before JSON parsing |
| Output reserve | 8,192 tokens, enforced with server-owned `num_predict`; reaching the limit is disclosed |

These are conservative **application limits**, not model token counts or a promise to use all advertised model capacity. [Ollama advertises a 128K-token context for the default gpt-oss:120b-cloud model](https://ollama.com/library/gpt-oss:120b-cloud). UTF-8 prompt bytes are used as a conservative admission guard, with substantial room for message formatting and output; no character-to-token conversion is presented as exact. This release does not add a model-specific tokenizer. A smaller-context model or provider allocation needs a separately verified budget; this limit is documented for the existing gpt-oss cloud configuration.

A document can meet the upload limits while its combination with other documents and sources exceeds the prompt limit. In that case **the entire inference request is blocked**. The user sees the measured prompt size and actions: remove documents or unnecessary sources, split a document, or start a new chat. The app does not silently truncate documents, drop KB modules, delete history to make it fit, or run an automatic partial analysis.

## Upload and recovery UI

Both interfaces display supported types and limits. React has an expandable limits panel, attachment sizes, individual Remove controls, Clear Documents, and visible rejection messages. Ingest switches to Chat so the result or rejection is visible. Reading a file blocks Send; mutations are disabled during inference. A multi-file selection is admitted atomically: if any new file is invalid, none from that selection is added, and previously accepted files stay attached.

UTF-8 decoding is strict. Unsupported extensions, empty files, invalid encoding, NUL/binary data, duplicate filenames and quota overflow are rejected without adding an excerpt. PDF and DOCX extraction are **not** supported by this uploader. Export those files as UTF-8 text for this release.

Streamlit's native uploader has a 1 MB transport ceiling; the clearly labeled application limit is **64 KiB per file** and is checked before decoding. The transport ceiling does not mean 1 MB documents are supported. Removing or clearing files resets the picker generation so old selections do not reappear on the next rerun.

## Request enforcement

The browser checks the final messages before calling `/api/chat`. The Edge handler independently bounds the request body, validates the final prompt and validates any attached document manifest/text. It rejects a new-client request whose declared complete document block is absent from the system context. Older messages-only clients remain supported but receive the same prompt/wire guards. Streamlit applies the same policy before `requests.post`.

File limits and prompt admission are checked in both runtimes; conformance tests compare policy values, rendered document blocks and rejection semantics. Cloud provider transport, credentials and configured model selection stay on their existing paths. No credentials were copied or changed.

## Verification

- `npm run phase4:gate`: pass, including 72 JavaScript checks and 124 Python tests, configuration validators, production build, compilation and diff checks. The new upload suite contributes 5 JavaScript checks and 4 Python tests.
- Actual React context builder and Edge handler: the exact 5,669-character synthetic plan reaches a recording provider intact, including CEDAR-731, 47 amber cones, DELTA-19 beyond character 5,500 and the explicit unspecified commander.
- Actual Streamlit context builder and provider function: full text retained; combined-prompt overflow makes zero HTTP provider calls.
- Browser React built app → real Edge handler → recording provider: full document delivered and normal completion; an oversized file is visibly rejected; a 134.1 KiB combined prompt is blocked before a provider call; removing the added large files restores normal completion with the valid plan still attached.
- Browser Streamlit → recording provider: full document delivered with automatic completion; a 133.9 KiB combined prompt produces a visible error without another provider request; Clear Documents survives the rerun without re-adding old selections.
- UTF-8/emoji boundary sizes, BOM, file count, duplicate names, aggregate limits, invalid encoding/type and bounded API payloads are covered.

Browser checks used isolated ports 5189/8559 with recording inference and unavailable external data. React's external Leaflet stylesheet was supplied from the installed package for the offline test. Blocked map/feed resources generated expected network errors; Streamlit also emitted framework warnings. These observations are not native/cloud answer-quality evidence.

No paid cloud generation was performed. These checks establish full-text construction, delivery and overflow behavior, **not model answer accuracy**. Hosted preview acceptance and a real cloud answer for the late-passage case remain pending the user's release/test workflow. There is no guarantee that a model will use every supplied fact correctly.

## Review and release

Reproduce checks from this worktree with Python dependencies available:

```sh
PATH="/Users/anthonyvota/Projects/openember/.venv/bin:$PATH" npm run phase4:gate
```

Review locally, then commit/push this branch through the user's normal Git workflow. Its Vercel preview will be separate from `feature/local-first-ollama`. Upload `tests/fixtures/uploads/synthetic-plan.txt` there and ask for CEDAR-731, cone count, radio channel and commander. Expected evidence: CEDAR-731, 47 amber cones, DELTA-19 and commander unspecified—not unassigned. Exercise an oversize upload and combined-context overflow as well before considering production.

The original development branch/worktree is preserved. No commit, push, PR, hosted deployment, environment change or production promotion was performed. Generated build assets are restored after validation.

Suggested commit: `fix(uploads): send complete cloud documents within explicit limits`.
