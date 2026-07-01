---
description: "Convergence loop — drive a Claude-native simulated call against a pathway, verify the expected outcomes, and keep editing the pathway files until every outcome holds. Self-driving (simulate → verify → edit → commit); can optionally hand off to the built-in /goal for cross-turn persistence."
argument-hint: "<pathway_id> [--from-call <id> | --transcript <file> | --goal '<objective>'] [--max N]"
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" generate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" validate:*)"
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "SlashCommand"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__bland__validate_pathway"
  - "mcp__bland__get_pathway_schema"
  - "mcp__bland__get_call_log"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__query_docs_filesystem_bland"
disallowed-tools:
  - "AskUserQuestion"
---

# Norm — Convergence Loop (Claude-native simulated calls)

Keep editing a pathway until it **passes a simulated call**: you invent a customer, drive a text conversation against the pathway turn-by-turn, then verify the expected call outcomes against the transcript. You (the optimizer) edit the pathway *files*; the ground truth is the simulated call you just ran and judged. You **self-drive** the loop — run simulate → verify → (edit → commit) passes until every outcome holds or you hit `--max`. (`/goal`, Claude Code's built-in cross-turn convergence primitive, is a *user-typed* command you cannot invoke; you may optionally print one for the user to run instead — see "Drive the loop".) There is no `.norm/loop.json`, no eval agents, no scenario ids, no workbench — those are retired.

The files are the workspace (clone via `bland_api_get` + the offline `norm-sync.cjs generate` codec; commit via `norm-sync.cjs rebuild` + `call_bland_api`). All server I/O is the MCP passthrough — the API key lives only in the MCP connection, never on a command line. See `bin/SYNC.md` for the full editing model.

Request:

```text
$ARGUMENTS
```

Parse `$ARGUMENTS` as a pathway id plus exactly one target source — `--from-call <call_id>`, `--transcript <file>`, or `--goal "<objective>"` — and optional `--max N` (default 8) for the pass bound (max re-simulations).

## Setup (first turn only)

1. **Clone the pathway into the local workspace** so you edit it as files:
   1. `mcp__bland__bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }` → unwrap the `{ data: … }` envelope to get `{ name, description, nodes, edges, production_version_number }`. If the GET fails (unknown id / missing auth), say exactly that and stop.
   2. Write the unwrapped graph JSON to a scratch file with native `Write` at `.norm/_server.json` (OUTSIDE `pathway/` — `generate` wipes its out-dir), then materialize the readable tree:
      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" generate .norm/_server.json pathway/
      ```
   3. Write a **baseline** copy of that same unwrapped JSON with native `Write` at `.norm/baseline.json` so `/norm:commit` can diff local vs. server without a credentialed pull.

2. **Derive the test from the source.** Reduce `--goal` / `--transcript` / `--from-call` (fetch the call's transcript with `mcp__bland__get_call_log` when given a call id) into two concrete things:
   - **(a) a customer scenario** — a specific persona with a specific reason for calling and the details they'll volunteer (e.g. "a caller whose latest invoice has a charge they don't recognize and who wants to know the refund window"). Read the cloned `pathway/` files so the scenario exercises the real flow.
   - **(b) the expected call outcomes** — the concrete, checkable things the pathway must produce for that scenario (e.g. "greets and asks what they need", "routes the billing question to billing help", "states the 30-day refund window", "asks if there's anything else", "ends with a warm wrap-up"). These outcomes are the fixed bar for the whole run — do not change them mid-loop.

## Drive the loop

**`/goal` is a user-typed UI command — you (this command) CANNOT invoke it.** It is not a skill and the `SlashCommand` tool does not expose it; trying to run `/goal` via the Skill or SlashCommand tool just fails. So do NOT attempt to set `/goal` yourself. Drive the loop directly instead:

**Self-drive (default).** Run one **simulate → verify → (edit → commit)** pass, then repeat until every expected outcome holds in one clean run or you reach `--max` passes (default 8). This is the whole loop — keep going across your own turns, re-simulating from a **fresh** chat instance after each commit. The per-pass work is in "Each pass" below.

**Optional — hand off to `/goal` for cross-turn persistence.** If the user would rather have Claude Code's built-in `/goal` primitive drive it (so a long run survives across turns via its Stop-hook evaluator), do your setup + derivation, then PRINT this ready-to-run command for the **user** to paste (you cannot run it) and stop:

> `/goal` Pathway `<pathway_id>` passes a simulated call. I drive a text call via the Pathway Chat turn endpoint, playing a customer who `<scenario>`. Each turn I run the full simulation end-to-end and show the transcript plus an outcome checklist; the call passes only when the transcript shows `<expected outcomes — e.g. greets and asks the reason, collects the name, reads the callback number back, confirms the appointment day + time, ends with a warm by-name wrap-up>`. If any outcome fails, I make a minimal targeted edit to the pathway files, `/norm:commit`, and re-simulate from a fresh chat instance. Stop when every outcome holds in one clean run, or after `<N>` re-simulations.

When the user runs that, each `/goal` turn performs one pass from "Each pass" below and its evaluator re-checks the condition until it holds or the bound is hit. Either way the per-pass work is identical. Do NOT depend on any `hook-loop.cjs` (retired).

## How to simulate a call (thin — you decide the specifics)

The simulation is the doc-confirmed **Pathway Chat** turn surface. It is a safe simulation: no real call is placed, no recipient is dialed, no real-world side effect — so it can run freely (no confirm-gate on the simulation turns themselves). The server holds conversation state by `chat_id`, so each turn you send only the **new** customer message and read back the running history.

1. **Open a chat instance** against the just-committed pathway (confirm-gate not required — no side effect):
   ```
   mcp__bland__call_bland_api { method: "POST", path: "/v1/pathway/chat/create",
     body: { pathway_id: "<pathway_id>" } }
   ```
   Optional body fields: `start_node_id` (begin mid-flow), `request_data` (an object of initial variables referenced as `{{var}}` in nodes), `pathway_version` (a version number; omit to use production). Read `data.chat_id` from the response.

2. **Play the customer turn-by-turn.** Each turn, send the customer's next message:
   ```
   mcp__bland__call_bland_api { method: "POST", path: "/v1/pathway/chat/<chat_id>",
     body: { message: "<the customer's line>" } }
   ```
   The response `data` returns: `assistant_responses` (array of the pathway's reply strings for this turn), `current_node_id` / `current_node_name` (where the pathway is now — your routing evidence), `chat_history` (the full running `{ role, content }[]`), `variables` (current pathway variables — your extraction evidence), and `completed` (the call-ended signal — `true` once an End-Call node fires). Keep sending customer turns, staying in character for your scenario, until `completed` is `true` or the conversation has clearly concluded.

3. **Verify the outcome checklist against the transcript.** You ran the call, so you judge it: walk the final `chat_history` (plus `current_node_name` and `variables` as evidence) against each expected outcome and mark it met / not-met with the quote or node that proves it. This is what the `/goal` condition checks.

## Each pass (until converged)

1. **Simulate** a full call as above (fresh `chat/create`, drive to `completed`).
2. **Show the transcript + the outcome checklist** (each outcome, met/not-met, with evidence).
3. If **every outcome holds**, you're converged — report and stop.
4. If **any outcome fails**, make a **minimal, targeted edit** to the pathway FILES to fix exactly that gap — prose (`nodes/<slug>/node.md` body, `condition.md`, edge labels, `.pathways/global_prompt.md`) via native `Read`/`Edit`; structured surfaces (`variables.yaml`, `model.yaml`, `tools.yaml`, node frontmatter) by editing those files directly — they round-trip verbatim through `rebuild`. There are no `set_*` tools; the file is the edit. Before hand-authoring or heavily editing a structured surface, call `mcp__bland__get_pathway_schema` for that surface (`surface: node_tools|variables|model|unit_tests|node|edge`, `tool_type` for a single node-tool variant) to get the authoritative allowed shape + enums so the YAML is valid first-try. Then **validate before committing — CHANGE-AWARE**: `rebuild pathway/`, read the pre-edit graph from `.norm/baseline.json` (written at setup — the graph is the top-level `{ nodes, edges }`, or at `.graph`), and pass the rebuilt graph WITH the baseline to `mcp__bland__validate_pathway` (read-only, no confirm-gate; object bodies only, never stringified):

   ```
   mcp__bland__validate_pathway {
     nodes: <rebuilt nodes>,
     edges: <rebuilt edges>,
     baseline: { nodes: <baseline nodes>, edges: <baseline edges> }
   }
   ```

   If `.norm/baseline.json` is missing or has no usable graph, OMIT `baseline` and fall back to whole-graph validation. Act on the change-relevant results first: `introduced_errors` are the ones your edit broke — fix those (do NOT commit a graph the compiler rejects; a failing edit caught here saves a wasted commit + re-simulate); `introduced_warnings` and `runtime_contract_findings` where `relevant_to_changes: true` are [NEW FROM YOUR CHANGES] runtime-contract issues your edit introduced — resolve them before re-simulating, since they're the most likely cause of the outcome you just failed. Read those findings + `semantics_summary` to inform the fix (the routing/loop/tool-input contracts show why an edit misbehaves); pre-existing findings are secondary. Once it compiles clean, **`/norm:commit`** (confirm-gated). (If `validate_pathway` is unavailable on an older server, fall back to the offline `norm-sync.cjs validate pathway/` structural check and note the authoritative compile did not run.) End your turn; the `/goal` re-feeds the failing outcomes and you re-simulate next turn.

## Convergence doctrine

- **Ground truth only.** An outcome is met only when the simulated transcript proves it — quote the assistant line or cite the `current_node_name` / `variables` that show it. Never mark an outcome met on a hunch; "looks done" without the transcript line is the failure mode.
- **Never change the target mid-loop.** Keep the same scenario and the same expected outcomes for every pass. Chasing stylistic gaps the outcomes don't require means the loop never converges.
- **Minimal targeted edits.** Fix only the surfaces that move a failing outcome. Edit files, commit, re-simulate — never let a server-side auto-fixer mutate the pathway mid-loop (it would drift the local files out of sync).
- **Confirm-gate only the real write.** The only confirm-gated write is `/norm:commit`'s in-place version save — `POST /v1/convo_pathway/update` (object body `{ id, version_number, nodes, edges, revision_number }`) on the working version, NOT `POST /v1/pathway/<pathway_id>` (that hits the SMS router and 400s). The simulation turns (`/v1/pathway/chat/create` and `/v1/pathway/chat/<chat_id>`) place no real call and need no confirmation; read-only `bland_api_get` / `get_call_log` never do.
- **Never ask the user.** The `/goal` stops itself when every outcome holds in one clean run or the turn bound is hit.

## Sibling test surfaces (for reference)

- **Pathway Chat** (used here) — `POST /v1/pathway/chat/create` opens a stateful chat instance; `POST /v1/pathway/chat/<chat_id>` sends one customer turn and returns the assistant reply, current node, running `chat_history`, `variables`, and `completed`. The stateless-feeling, turn-by-turn simulation driver.
- **Agent Testing scenarios** — `/v1/agent-testing/scenarios` (+ `/runs`, `/batches`, `/simulation-sets`): persisted tester-persona scenarios with assertions that an AI caller runs and scores server-side; heavier, async, and not used by this loop.
- **Node tests** — `POST /v1/node_tests/invoke` (read back via `GET /v1/node_tests/run/:id`): re-runs a single node's prompt against sampled conversations to catch prompt regressions; node-scoped, not a full call.

When the loop ends, report: the pathway id + final committed state, converged (yes/no), how many simulate passes ran, the final outcome checklist with its transcript evidence, and any outcome still failing with the line that proves it.
