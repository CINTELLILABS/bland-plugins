---
description: Validate the local pathway workspace with the authoritative server compiler. Use when the user wants to check, compile, lint, or verify the pathway, find errors or warnings before saving or committing, or asks whether the pathway is valid or will build.
allowed-tools:
  - "Read"
  - "Edit"
  - "Write"
  - "Glob"
  - "Grep"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" validate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
  - "mcp__bland__validate_pathway"
  - "mcp__plugin_norm_bland__validate_pathway"
---

# Validate Bland Pathway

Compile the current local workspace and report the results. Never call a pathway ready until it validates with no errors.

**The authoritative validation is `validate_pathway` — the server-side compiler, 1:1 with what the pathway editor runs.** Given the rebuilt `{ nodes, edges }`, it runs the full Layer-2 compile (start/end/reachability/dead-end structural checks, routing/loop/dialogue/tool-input runtime contracts, per-node semantics) and returns `{ valid, errors, warnings, stats, runtime_contract_findings, semantics_summary }`. It is READ-ONLY — nothing is persisted — so it runs freely with no confirm-gate. The offline `norm-sync.cjs validate` structural check is a **fast pre-filter** only: it catches gross structural breakage (missing start node, dangling edge endpoints, malformed YAML, broken round-trip) without a round-trip to the server, but it is NOT the authority. The compiler sees contracts the offline check cannot.

Save endpoints are unchanged: the real save is `POST /v1/convo_pathway/update` (in-place version save) / `POST /v1/convo_pathway/create-version` (first commit, forks a working version); NOT `POST /v1/pathway/:id`, which hits the SMS router and 400s.

Steps:

1. **Fast pre-filter (offline).** Run the offline codec's structural check over the workspace tree and read its JSON stdout:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" validate pathway/
   ```

   - `ok: false` (`error.code: "VALIDATION_FAILED"`) → the tree is grossly broken. Fix the reported `errors` on the correct file surface before going further (no point compiling a tree that won't rebuild):
     - prompt / condition / global prompt / edge label → native `Edit`/`Write` on the prose file (`node.md`, `condition.md`, `.pathways/global_prompt.md`, `edges/*.md`).
     - variables / model / node tools / unit tests / type-specific node config → edit the structured YAML/frontmatter in the file (`variables.yaml`, `model.yaml`, `tools.yaml`, the node frontmatter). These are JSON-inlined and round-trip verbatim; they are persisted as part of the `{ nodes, edges }` body on `/norm:commit`.
     Re-run the offline check until it rebuilds cleanly, THEN continue to the authoritative compile.
   - `ok: true` → the tree rebuilds. Continue to the authoritative compile (do not stop here — a clean offline pass is NOT the authority).

2. **Reconstruct the graph.** Rebuild `{ nodes, edges }` from the local file tree (raw graph JSON on stdout, exactly the compiler's input shape):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" rebuild pathway/
   ```

3. **Authoritative compile — CHANGE-AWARE.** Read the pre-edit graph from `.norm/baseline.json` (written at clone) — the graph is at `.graph` (`{ nodes, edges }`) or, on a loop-written baseline, at the top level — and pass it as `baseline` so the compiler diffs your edit against it. Object bodies only (native JSON, never stringified):

   ```
   validate_pathway {
     nodes: <rebuilt nodes>,
     edges: <rebuilt edges>,
     baseline: { nodes: <baseline nodes>, edges: <baseline edges> }
   }
   ```

   If `.norm/baseline.json` is missing or has no usable graph, OMIT `baseline` and fall back to whole-graph validation (call with just `{ nodes, edges }`) — say the results are whole-graph, not change-scoped.

   (Optionally also pass `requestData: { … }` — an object of the initial `{{variables}}` an inbound call/request would supply — so the compiler treats those as pre-satisfied inputs and doesn't flag them as unresolved.)

   **Report the CHANGE-RELEVANT results first — these came FROM your edit** ([NEW FROM YOUR CHANGES]):
   - `introduced_errors` — errors your edit broke. These MUST be fixed before ready; a pre-existing error you didn't touch is secondary.
   - `introduced_warnings` + any `runtime_contract_findings` where `relevant_to_changes: true` — routing/loop/dialogue/tool-input contracts your edit introduced. Address these before moving on.
   - `validation_delta_summary` — the introduced-vs-pre-existing counts; lead with it so the user sees what changed.

   Then interpret overall validity:
   - `valid: true` → the compile passed. Report remaining `warnings` and whole-graph `runtime_contract_findings` (each `{ code, target, message, relevant_to_changes, semantic_context }`) plainly — advisory routing/loop/dialogue/tool-input contracts, not blockers. Do not restructure the pathway to silence a PRE-EXISTING warning unless the user wants that change; focus fixes on the change-relevant findings.
   - `valid: false` → fix the reported `errors` (`{ severity, code, message, node_id, node_name, edge_label, tool_name, … }`), prioritizing `introduced_errors`, on the correct file surface (same surface mapping as step 1), then re-rebuild and re-compile (re-passing `baseline`). Repeat until `valid: true`.

   Use `runtime_contract_findings` + `semantics_summary` to reason about the edit: they tell you each node's routing mechanism, loop contract, control surface, and attached tools — read them before deciding a fix, don't guess. When `baseline` was passed, the findings flagged `relevant_to_changes: true` are the ones YOUR edit introduced — fix those first.

   (Without `baseline`, the delta fields `introduced_errors` / `introduced_warnings` / `validation_delta_summary` are absent and every `runtime_contract_findings.relevant_to_changes` is `false` — that's the whole-graph fallback, so say so.)

4. **GRACEFUL FALLBACK.** If `validate_pathway` is NOT available in this session (an older server without the tool), fall back to the offline structural check from step 1 as the gate and say so explicitly: report that the authoritative compile was unavailable and only the offline structural pre-check ran, so contracts the compiler would catch (loop/tool-input/dialogue/routing) were NOT verified. Do not claim a clean offline pass is a full compile.

5. If this validation is part of a create, edit, or fix task and the compile is clean (`valid: true`), continue: run targeted tests when useful (`/norm:test`), then commit in the same run (`/norm:commit`). Do not stop at a clean validation pass and ask whether to save.

Report: authoritative compile status (`valid` true/false, or "unavailable — offline pre-check only" on fallback), the offline pre-filter status, the **change-relevant results first** (`introduced_errors`, `introduced_warnings`, and `runtime_contract_findings` where `relevant_to_changes: true` — plus the `validation_delta_summary` counts if a baseline was passed; or note "whole-graph — no baseline"), then the remaining pre-existing warnings + findings, what was fixed, and the reminder that `/norm:commit` persists to the `/v1/convo_pathway` working version (and may still return an error envelope even after a clean compile).
