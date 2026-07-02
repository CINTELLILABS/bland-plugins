# Norm — Cheat Sheet

Build, test, debug, and measure Bland voice agents from Claude Code.

## Install

```
claude plugin marketplace add CINTELLILABS/bland-plugins
claude plugin install norm@bland --config bland_api_key=YOUR_KEY   # key: app.bland.ai → API keys
```

Restart your Claude Code session. Key is stored in your OS keychain. Point at a dev server anytime with `/norm:config <https-tunnel-url>` (back with `--prod`; restart after switching).

## Pathway building (the core loop)

| Command | What it does |
|---|---|
| `/norm:norm` | Just talk to it — "make the greeting collect a callback number". Does edit → validate → commit for you. |
| `/norm:list` | List your org's pathways. |
| `/norm:clone <id \| new>` | Check a pathway out as local files (prompts = markdown, config = YAML). Edit them like code. |
| `/norm:validate` | Compile with the real server compiler — errors, warnings, runtime-contract findings — before saving. |
| `/norm:commit` | Save back to the server as a working version. Production untouched. |
| `/norm:status` | Workspace state: dirty files, version, server drift. |
| `/norm:test [node]` | Simulated call (text chat) against your pathway. No real dial. |
| `/norm:loop <id> --goal '…'` | **Self-driving convergence**: derives a test bar from your goal, then simulates → judges → fixes → re-validates → commits, repeating until every outcome passes (or max/stall). A Stop-hook gate keeps it running; an independent judge grades every pass. Also `--from-call <id>` / `--transcript <file>`. |

## Debugging & forensics

| Command | What it does |
|---|---|
| `/norm:debug <symptom>` | Systematic root-cause debugging: deterministic repro first (`.norm/repro/`), layer isolation, one minimal fix, verified with the same repro. In the SERVER repo it fixes code (guided by the repo's own skill); anywhere else it fixes pathway/config or hands you an escalation-ready repro pack. |
| `/norm:review <call_id or "find …">` | Call forensics: finds calls by filter, classifies the node-by-node pathway logs, traces variables, and delivers an evidence-quoted verdict on where it broke. |
| `/norm:triage` | File/track issues with evidence (call/pathway/node ids, repro, hypothesis history). Debug packs file straight in. |

## Quality & measurement

| Command | What it does |
|---|---|
| `/norm:evals` | LLM judges for real calls: generate a judge (from a prompt, a call, or a triage issue), calibrate it on known calls, assemble weighted panels, estimate cost, run, drill verdicts — and attach a panel to calls so **every call auto-scores post-call with verdicts saved as pathway tags**. |
| `/norm:analytics` | Real metrics (volume, completion, durations, cost, trends), drill-down to the calls behind a number, **define outcomes** (citation schemas), audit extraction quality, and **build live dashboards** in the Bland UI. |

## Building blocks

| Command | What it does |
|---|---|
| `/norm:tools` | Custom REST + integration tools: design (ACI principles), test-run before attaching, secrets by reference, tool error/latency stats. |
| `/norm:persona` | Voices, call config, knowledge/tool attachment, pathway routing; draft vs production with explicit promotion. |
| `/norm:knowledge` | Knowledge bases the agent cites mid-call — ingestion isn't done until retrieval proves it. |
| `/norm:api` | Raw Bland REST access, docs-first: look the endpoint up, then call it. |
| `/norm:config` | Show/switch the API URL (prod ↔ dev tunnel). Key never touched. |

## Rules it lives by

- **Numbers and verdicts only from things it actually ran** — every claim carries a read-back, transcript quote, or log line.
- **Reads are free; writes confirm** — anything that mutates, costs money, or dials asks first (with cost estimates for eval runs/backfills).
- Your API key never appears in chat, files, or output — it lives in the keychain and travels only inside the MCP connection.
