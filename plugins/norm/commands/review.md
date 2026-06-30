---
description: Review and debug a real Bland call — mount it into the workspace as files for native Read/Grep/Glob inspection, get a semantic verdict, and turn a confirmed bug into a regression test.
allowed-tools:
  - "Task"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm Call Review

Mount a real Bland call into the local workspace as files and review it through the `norm_review` agent, which owns the doctrine (mount → native Read/Grep/Glob → analyze_call → generate_from_call).

User request:

```text
$ARGUMENTS
```

Steps:

1. If `$ARGUMENTS` contains a call id, mount it locally first by running the bundled sync engine, and read its JSON stdout (`calls_dir`, `files_written`, `flagged_files`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" mount-call <call_id>
   ```

   The call's transcript, routing/decision logs, variables, and tool/webhook logs land under `calls/<call_id>/`. If no id was given, launch the agent to find the call first (`search_calls` / `list_recent_calls`), then mount it.
2. Launch the `norm_review` agent (via the `Task` tool, `subagent_type: norm_review`) and hand it the user request verbatim plus the mounted `calls_dir`. It inspects the logs with native `Glob` / `Grep` / `Read` (reading the `[!!!]`-flagged files first), gets the semantic verdict with `analyze_call`, diagnoses the root cause node by node, and — for a confirmed bug — calls `generate_from_call` to create a regression test.
3. Before any high-impact action (`stop_call`, `resend_postcall_webhook`), get explicit user confirmation.
4. Final answer must include the call id, the goal verdict, the root cause tied to a specific node/edge/variable/tool, the decisive evidence, the local `calls/<call_id>/` path, and any regression test id created.

Do not use the MCP `call_log_glob` / `call_log_grep` / `call_log_read` wrappers — the call is local files; inspect with native `Read` / `Grep` / `Glob`.
