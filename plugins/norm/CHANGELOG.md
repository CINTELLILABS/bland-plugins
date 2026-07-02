# Changelog

## 1.8.0 — 2026-07-01

- **norm_analytics is now a measurement ENGINEER, not just a query answerer** (routes sourced from the live server surface):
  - **Outcome engineering** — full citation-schema lifecycle: design variables like rubric dimensions (categorical-with-options over free strings, evidence-based descriptions, flag-mode conditions as automatic QA), create/update via the passthrough, verify with `preview` backfills on known calls before trusting, audit quality via the schema-analytics routes (time-series, top-values, issues) and coverage queries.
  - **Backfill discipline** — enterprise-gated, billed-per-extraction, async workflow polling; scope (schema × call count) stated in every confirmation.
  - **Dispositions** — post-call sandboxed-JS outcomes: CRUD, AI-assisted generate/adjust from a real call, test-run before trusting, then chart via `source:"disposition"`.
  - **Dashboard building** — create live boards of query/code panels in the Bland UI (panel = proven query + viz type + optional period comparison); never ship a panel whose query wasn't executed first; read the board back as evidence.
  - Guardrails split: reads free; creates/updates/backfills/runs confirm-gated; enterprise 403s reported, not retried around.

## 1.7.1 — 2026-07-01

- **norm_analytics rebuilt with the baked query contract** (sourced from the server's analytics compiler): full metrics/dimensions/filters/operator catalog, per-metric conditional filters as the rate idiom, time-bucket dimensions, citation/disposition sources, `pathway_tags` membership semantics, rows-mode drill-down (aggregate → rows → `/norm:review` pipeline), the recipe cookbook (volume, completion rate, durations/cost, voicemail split, transfers, tags, failures), and the hard limits that shape strategy (365d / 30s / 10GB / row caps) — queries now compose correctly first-try instead of rediscovering the schema each session.

## 1.7.0 — 2026-07-01

Best-practices pass over the remaining domain agents (Anthropic rubric/tool-design/verification doctrine):

- **norm_evals — "Designing judges" rubric doctrine**: one dimension per judge (no blended quality scores), binary/small-enum verdicts with explicit thresholds, quote-level evidence per dimension, pass^k for flaky behaviors, fresh-context grading; read-back verification for every eval-agent/run write.
- **norm_tools — "Design the tool like Anthropic designs tools"**: verb-first names checked against the org's existing tools, trigger-style descriptions, caller-collected-only input schemas, minimum-payload `response_data` (bloat burns the voice agent's context), actionable error messages, phone-latency timeouts with `speech` always set; plus "Test before attach" — a tool that saved is not a tool that works.
- **norm_triage — "Issue quality bar"**: duplicate search before filing, mandatory evidence links (call/pathway/node ids) + repro + hypothesis history; `/norm:debug` triage packs accepted verbatim; read-back on every filed/updated issue.
- **norm_knowledge — "Ingestion is not done until retrieval proves it"**: 2–3 verification questions only the new content can answer, retrieved passages quoted as proof; COMPLETED status ≠ retrievability; attachment verified by config read-back.
- **norm_persona — "Verify before claiming"**: config read-back after every change, explicit DRAFT vs PRODUCTION statement, promote only on explicit confirmation, one-surface-at-a-time changes.
- **norm_api — "Contract traps" + "Error playbook"**: string query values / object bodies / convo_pathway router; 401/403/404/422/-32000/-32003 recovery moves; GET-back after every write.
- **Skill — "Evidence before claims"**: no created/saved/fixed/working claims without the read-back, repro re-run, or quoted transcript evidence; unverified beats a confident guess.

## 1.6.2 — 2026-07-01

- `norm_debug` rebuilt on the systematic-debugging discipline (four phases + the Iron Law: no fixes before root-cause investigation), hyper-specialized to pathways/agents: per-boundary evidence table (transcript / decision entries / variable timeline / webhook records / contract context-windows), **pathway version diff via change-aware validation** as the domain's `git diff`, mid-flow chat-sim (`start_node_id` + `request_data`) as the unit test, statically contract-confirmed hypotheses (`get_pathway_context` stuck-reasons), failing-repro-before-fix, the 3-fix rule (three failures = structural problem, stop), and triage-ready evidence packs for `/norm:triage` when the bug is out of reach. Invokes `superpowers:systematic-debugging` when present; self-contained otherwise.

## 1.6.1 — 2026-07-01

- Renamed `/norm:dev` → **`/norm:debug`** (`norm_debug`) and dropped the dev-only gate: systematic reproduce → isolate → fix → verify debugging is for EVERYONE, on production or a dev server. On prod it repros against throwaway resources and fixes at the pathway/config level; when the working tree contains a server codebase it adds the code-fix loop (guided by that repo's own CLAUDE.md/skills). Server bugs with no codebase present come back as escalation-ready repros.

## 1.6.0 — 2026-07-01

- **Dev mode** — for users pointing the plugin at their own dev/staging server (`/norm:config <tunnel-url>`): new `/norm:dev` command + `norm_dev` agent drive systematic server debugging — deterministic repro file (`.norm/repro/`), layer isolation (transport/auth vs contract vs behavior), smallest fix in the LOCAL server codebase, restart per the project's own docs, re-verify with the original repro (with the swept-MCP-session retry gotcha built in). SessionStart hook shows a DEV MODE banner whenever the configured URL isn't production.
- **IP boundary by design**: the plugin ships only the generic loop. Server internals (layout, rebuild/restart steps, landmines) live in each server repo's own project skill / CLAUDE.md, which `norm_dev` discovers in the working tree — nothing proprietary in this public plugin.

## 1.5.0 — 2026-07-01

Best-practices hardening pass (sourced from the official Claude Code authoring docs + Anthropic agent-design engineering posts):

- **`norm_judge` (new agent) — judge separation for `/norm:loop`.** Simulation grading now runs in a fresh-context evaluator with zero optimizer bias: per-outcome met/not-met verdicts with mandatory evidence quotes, strict grounding rules (spoken text must match the variable; literal `{{var}}` = fail), and a ready-to-record `FAILING:` line the Stop-hook gate re-feeds verbatim. The optimizer no longer grades its own work.
- **`norm_review` rebuilt as a call-forensics specialist**: `/v1/calls` discovery cookbook (full filter surface + recipes), field-by-field call-record anatomy, the `pathway_logs` classification key-map (webhook/error/custom_code/tool_call/kb/sms/scheduling/routing/variables/loop/decision) with `[!!!]` issue markers, local workspace materialization for heavy calls, symptom playbooks, and expected-vs-observed reconciliation via `get_pathway_context`.
- **Description sweep (22 files)**: all command + agent descriptions rewritten to trigger-condition style ("Use when …", keyword-dense) per the official guidance — descriptions drive delegation and slash-command discoverability.
- **SKILL.md "Platform runtime gotchas"**: verified-live rules (webhook `responseData` vars are not substituted into the same node's dialogue on the firing turn — deliver in the next node; object bodies / string query params; `/v1/convo_pathway` save router; chat-sim webhook evidence rules; extraction-vs-routing parallelism).
- **`super_norm` gains persistent memory** (`memory: user`) — durable platform gotchas survive across sessions.
- norm-analytics: explicit read-only Guardrails section.

## 1.4.0 — 2026-07-01

- `/norm:loop` is now **truly autonomous**: resurrected the Stop-hook convergence gate (`hook-loop.cjs` + `norm-loop.cjs`, modernized to the passthrough surface). The command arms `.norm/loop.json` at setup and records every simulation verdict; while the target fails, the Stop hook blocks the turn from ending and re-feeds the exact failing outcomes (documented `decision: "block"` + `reason` contract). Releases on convergence, `--max` passes (default 8), stall (same failures twice), 24h staleness, or a deliberate `norm-loop.cjs stop`. Session-isolated and fail-soft — never fires outside an armed loop.

## 1.3.1 — 2026-07-01

- Configure panel order: API key (required) first, URL (optional) second.

## 1.3.0 — 2026-07-01

- API key stays **encrypted in the OS keychain** (`sensitive: true`). Onboard/rotate via the plugin's interactive install prompt or `claude plugin install norm@bland --config bland_api_key=...`; the key never touches a plaintext file or the chat. (Supersedes a brief 1.2.x that tried plaintext settings.json + a native dialog — reverted for security; the keychain is more secure than a file.)
- `/norm:config` still switches the non-sensitive `bland_api_url` without reinstalling.

## 1.1.0 — 2026-07-01

- `/norm:config` — switch the Bland API URL (prod ↔ dev tunnel) without reinstalling; documented-storage write + restart note. Key stays in the OS keychain.
- README: "Switching environments" section incl. key-rotation guidance.

## 1.0.0 — 2026-07-01

- Rebuilt onto the live `/v1/mcp` action-widget surface: client-side file workspace + MCP passthrough (`bland_api_get` / `call_bland_api`); offline `norm-sync.cjs` codec powered by the real bundled engine.
- Pathway saves via `/v1/convo_pathway/*` (create-version / update / publish); `POST /v1/pathway/<id>` retired (SMS router).
- `validate_pathway` (change-aware compiler + pathway-canvas widget), `get_pathway_schema` (structured-surface shapes), `get_pathway_context` (deep node/edge/dependency semantics) wired into `super_norm` and the `/norm:*` commands.
- `/norm:test` + `/norm:loop` use the Claude-native Pathway Chat simulation (`/v1/pathway/chat/*`).
- Skill + hook doctrine updated to the file-first model (structured YAML is hand-edited, schema-guided, compiler-gated).
