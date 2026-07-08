---
description: "Convergence loop — drive a Claude-native simulated call against a pathway, verify the expected outcomes, and keep editing the pathway files until every outcome holds. Truly autonomous: a Stop-hook gate re-feeds the failing outcomes every time the turn tries to end, until the loop converges, hits max passes, or stalls."
argument-hint: "<pathway_id> [--from-call <id> | --transcript <file> | --goal '<objective>'] [--max N]"
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" generate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" validate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs\" init:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs\" record:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs\" status)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs\" stop)"
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "SlashCommand"
  - "mcp__bland__bland_api_get"
  - "mcp__plugin_norm_bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__plugin_norm_bland__call_bland_api"
  - "mcp__bland__validate_pathway"
  - "mcp__plugin_norm_bland__validate_pathway"
  - "mcp__bland__get_pathway_schema"
  - "mcp__plugin_norm_bland__get_pathway_schema"
  - "mcp__bland__get_call_log"
  - "mcp__plugin_norm_bland__get_call_log"
  - "mcp__bland__search_bland_docs"
  - "mcp__plugin_norm_bland__search_bland_docs"
  - "mcp__bland__query_docs_filesystem_bland"
  - "mcp__plugin_norm_bland__query_docs_filesystem_bland"
disallowed-tools:
  - "AskUserQuestion"
---

# Norm — Convergence Loop (Claude-native simulated calls)

Keep editing a pathway until it **passes a simulated call**: you invent a customer, drive a text conversation against the pathway turn-by-turn, then verify the expected call outcomes against the transcript. You (the optimizer) edit the pathway *files*; the ground truth is the simulated call you just ran and judged.

**The loop is mechanically enforced, not willpower.** At setup you arm a loop state file (`.norm/loop.json` via `norm-loop.cjs init`); after every simulation you record the verdict (`norm-loop.cjs record`). While the target fails, the plugin's Stop hook **blocks every attempt to end the turn** and re-feeds the exact failing outcomes as your next instruction — the documented Claude Code Stop-hook contract (`decision: "block"` + `reason`), the same primitive `/goal` is built on. The hook releases on its own when the target passes, `--max` passes are spent, the same failures persist twice in a row (stall), or the state goes stale (24h). So: self-drive as far as you can within each turn, and if a turn ends early the hook re-engages you — the loop cannot silently die.

The files are the workspace (clone via `bland_api_get` + the offline `norm-sync.cjs generate` codec; commit via `norm-sync.cjs rebuild` + `call_bland_api`). All server I/O is the MCP passthrough — the API key lives only in the MCP connection, never on a command line. See `bin/SYNC.md` for the full editing model.

Request:

```text
$ARGUMENTS
```

Parse `$ARGUMENTS` as a pathway id plus exactly one target source — `--from-call <call_id>`, `--transcript <file>`, or `--goal "<objective>"` — and optional `--max N` (default 8) for the pass bound (max re-simulations).

## Setup (first turn only)

1. **Clone the pathway into the local workspace** so you edit it as files:
   1. `bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }` → unwrap the `{ data: … }` envelope to get `{ name, description, nodes, edges, production_version_number }`. If the GET fails (unknown id / missing auth), say exactly that and stop.
   2. Write the unwrapped graph JSON to a scratch file with native `Write` at `.norm/_server.json` (OUTSIDE `pathway/` — `generate` wipes its out-dir), then materialize the readable tree:
      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" generate .norm/_server.json pathway/
      ```
   3. Write a **baseline** copy of that same unwrapped JSON with native `Write` at `.norm/baseline.json` so `/norm:commit` can diff local vs. server without a credentialed pull.

2. **Derive the test from the source.** Reduce `--goal` / `--transcript` / `--from-call` (fetch the call's transcript with `get_call_log` when given a call id) into two concrete things:
   - **(a) a customer scenario** — a specific persona with a specific reason for calling and the details they'll volunteer (e.g. "a caller whose latest invoice has a charge they don't recognize and who wants to know the refund window"). Read the cloned `pathway/` files so the scenario exercises the real flow.
   - **(b) the expected call outcomes** — the concrete, checkable things the pathway must produce for that scenario (e.g. "greets and asks what they need", "routes the billing question to billing help", "states the 30-day refund window", "asks if there's anything else", "ends with a warm wrap-up"). These outcomes are the fixed bar for the whole run — do not change them mid-loop.

3. **Arm the loop gate** so the Stop hook can drive convergence across turns:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs" init <pathway_id> --max <N> \
     --scenario "<the customer persona from (a)>" \
     --outcomes "<the outcomes from (b), ';' separated>"
   ```

   This writes `.norm/loop.json` (`--max` defaults to 8). **Arm it in the session's launch directory tree**: the Stop hook resolves the state file by walking up from the session's working directory, so a loop armed in an unrelated folder is invisible to the gate. From here the loop is armed: the Stop hook will not let a turn end while the last recorded verdict is failing.

## Drive the loop

**Self-drive, hook-backed.** Run **simulate → verify → (edit → validate → commit) → record** passes back-to-back within your turn until every expected outcome holds in one clean run or you reach `--max` passes. Prefer completing as many passes as possible per turn (fewer round-trips); the Stop-hook gate exists so that a turn ending early does **not** kill the run — if you stop while the last recorded verdict is failing, the hook blocks the stop and re-feeds the failing outcomes as your next instruction, spending one pass from the budget. The per-pass work is in "Each pass" below.

**Termination is the hook's job, not a judgment call.** It releases automatically on: every outcome recorded passing (✅ converged), `--max` passes spent (🛑 report what still fails), the same failing set recorded twice in a row (🛑 stalled — the approach isn't working; report rather than thrash), or a stale loop (24h untouched). To abort deliberately (user asks to stop, or the target turns out to be wrong): `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs" stop`, then explain why.

(`/goal`, Claude Code's built-in convergence primitive, is a user-typed UI command you cannot invoke — and it is no longer needed here: the armed loop gate provides the same Stop-hook persistence, purpose-built for this pathway workflow.)

## How to simulate a call (thin — you decide the specifics)

The simulation is the doc-confirmed **Pathway Chat** turn surface. It is a safe simulation: no real call is placed, no recipient is dialed, no real-world side effect — so it can run freely (no confirm-gate on the simulation turns themselves). The server holds conversation state by `chat_id`, so each turn you send only the **new** customer message and read back the running history.

1. **Open a chat instance** against the just-committed pathway (confirm-gate not required — no side effect):
   ```
   call_bland_api { method: "POST", path: "/v1/pathway/chat/create",
     body: { pathway_id: "<pathway_id>" } }
   ```
   Optional body fields: `start_node_id` (begin mid-flow), `request_data` (an object of initial variables referenced as `{{var}}` in nodes), `pathway_version` (a version number; omit to use production). Read `data.chat_id` from the response.

2. **Play the customer turn-by-turn.** Each turn, send the customer's next message:
   ```
   call_bland_api { method: "POST", path: "/v1/pathway/chat/<chat_id>",
     body: { message: "<the customer's line>" } }
   ```
   The response `data` returns: `assistant_responses` (array of the pathway's reply strings for this turn), `current_node_id` / `current_node_name` (where the pathway is now — your routing evidence), `chat_history` (the full running `{ role, content }[]`), `variables` (current pathway variables — your extraction evidence), and `completed` (the call-ended signal — `true` once an End-Call node fires). Keep sending customer turns, staying in character for your scenario, until `completed` is `true` or the conversation has clearly concluded.

3. **Hand the grading to the `norm_judge` agent — never grade your own work.** Launch it via the `Task` tool (`subagent_type: norm_judge`) with, verbatim: the full final `chat_history`, the final `variables`, `current_node_name`, the `completed` flag, and the FIXED outcome bar. The judge runs in a fresh context with none of your editing reasoning, so its verdicts carry no optimizer bias — it returns one met/not-met per outcome with the exact quote, variable, or node as evidence, `PASSED: true|false`, and (on failure) a ready-to-record `FAILING:` line. Use its verdicts as-is; do not overrule a `not_met` because the transcript "looks close".

## Each pass (until converged)

1. **Simulate** a full call as above (fresh `chat/create`, drive to `completed`).
2. **Judge via `norm_judge`** (step 3 above), then **show the transcript + the judge's verdict table** (each outcome, met/not-met, with its evidence).
3. If **every outcome holds**, you're converged — record it so the gate releases, then report and stop:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs" record --passed true
   ```

4. If **any outcome fails**, first record the judge's verdict (this is what the Stop hook re-feeds and how it detects stalls — record it immediately after judging, before editing, using the judge's `FAILING:` line verbatim):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs" record --passed false --failing "<the judge's FAILING line>"
   ```

   Then make a **minimal, targeted edit** to the pathway FILES to fix exactly that gap — prose (`nodes/<slug>/node.md` body, `condition.md`, edge labels, `.pathways/global_prompt.md`) via native `Read`/`Edit`; structured surfaces (`variables.yaml`, `model.yaml`, `tools.yaml`, node frontmatter) by editing those files directly — they round-trip verbatim through `rebuild`. There are no `set_*` tools; the file is the edit. Before hand-authoring or heavily editing a structured surface, call `get_pathway_schema` for that surface (`surface: node_tools|variables|model|unit_tests|node|edge`, `tool_type` for a single node-tool variant) to get the authoritative allowed shape + enums so the YAML is valid first-try. Then **validate before committing — CHANGE-AWARE**: `rebuild pathway/`, read the pre-edit graph from `.norm/baseline.json` (written at setup — the graph is the top-level `{ nodes, edges }`, or at `.graph`), and pass the rebuilt graph WITH the baseline to `validate_pathway` (read-only, no confirm-gate; object bodies only, never stringified):

   ```
   validate_pathway {
     nodes: <rebuilt nodes>,
     edges: <rebuilt edges>,
     baseline: { nodes: <baseline nodes>, edges: <baseline edges> }
   }
   ```

   If `.norm/baseline.json` is missing or has no usable graph, OMIT `baseline` and fall back to whole-graph validation. Act on the change-relevant results first: `introduced_errors` are the ones your edit broke — fix those (do NOT commit a graph the compiler rejects; a failing edit caught here saves a wasted commit + re-simulate); `introduced_warnings` and `runtime_contract_findings` where `relevant_to_changes: true` are [NEW FROM YOUR CHANGES] runtime-contract issues your edit introduced — resolve them before re-simulating, since they're the most likely cause of the outcome you just failed. Read those findings + `semantics_summary` to inform the fix (the routing/loop/tool-input contracts show why an edit misbehaves); pre-existing findings are secondary. Once it compiles clean, **`/norm:commit`** (confirm-gated). (If `validate_pathway` is unavailable on an older server, fall back to the offline `norm-sync.cjs validate pathway/` structural check and note the authoritative compile did not run.) Then start the next pass immediately (fresh simulate); if the turn ends instead, the armed Stop hook re-feeds the recorded failures and the loop continues next turn.

## Convergence doctrine

- **Ground truth only.** An outcome is met only when the simulated transcript proves it — quote the assistant line or cite the `current_node_name` / `variables` that show it. Never mark an outcome met on a hunch; "looks done" without the transcript line is the failure mode.
- **Never change the target mid-loop.** Keep the same scenario and the same expected outcomes for every pass. Chasing stylistic gaps the outcomes don't require means the loop never converges.
- **Minimal targeted edits.** Fix only the surfaces that move a failing outcome. Edit files, commit, re-simulate — never let a server-side auto-fixer mutate the pathway mid-loop (it would drift the local files out of sync).
- **Confirm-gate only the real write.** The only confirm-gated write is `/norm:commit`'s in-place version save — `POST /v1/convo_pathway/update` (object body `{ id, version_number, nodes, edges, revision_number }`) on the working version, NOT `POST /v1/pathway/<pathway_id>` (that hits the SMS router and 400s). The simulation turns (`/v1/pathway/chat/create` and `/v1/pathway/chat/<chat_id>`) place no real call and need no confirmation; read-only `bland_api_get` / `get_call_log` never do.
- **Never ask the user.** The loop gate releases itself when every outcome holds in one clean run, the pass bound is hit, or the same failures stall twice — `AskUserQuestion` is disallowed here for exactly this reason.
- **Record every verdict.** The gate can only see what `norm-loop.cjs record` wrote — an unrecorded simulation is invisible to convergence, stall detection, and the pass budget. Judge → record → then edit.

## Sibling test surfaces (for reference)

- **Pathway Chat** (used here) — `POST /v1/pathway/chat/create` opens a stateful chat instance; `POST /v1/pathway/chat/<chat_id>` sends one customer turn and returns the assistant reply, current node, running `chat_history`, `variables`, and `completed`. The stateless-feeling, turn-by-turn simulation driver.
- **Agent Testing scenarios** — `/v1/agent-testing/scenarios` (+ `/runs`, `/batches`, `/simulation-sets`): persisted tester-persona scenarios with assertions that an AI caller runs and scores server-side; heavier, async, and not used by this loop.
- **Node tests** — `POST /v1/node_tests/invoke` (read back via `GET /v1/node_tests/run/:id`): re-runs a single node's prompt against sampled conversations to catch prompt regressions; node-scoped, not a full call.

When the loop ends, report: the pathway id + final committed state, converged (yes/no), how many simulate passes ran, the final outcome checklist with its transcript evidence, and any outcome still failing with the line that proves it.
