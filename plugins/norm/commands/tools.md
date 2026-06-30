---
description: Build, test, and manage Bland custom integrations — REST API tools, sandboxed JavaScript code tools, and the secrets they use.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm Tools

Build, test, and manage Bland custom integrations and their secrets; the `norm_tools` agent owns this doctrine.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_tools` agent via the Task tool with `subagent_type: norm_tools`, handing it the user request verbatim.
2. Decide REST (`create_tool`) vs CODE (`create_code_tool`); if the API needs auth, store the key first with `create_secret` and reference it as `{{secret.id.SECRET_ID}}` rather than inlining it — reuse an existing one via `list_secrets` / `pick_secret` when possible.
3. Before shipping, run `test_tool` with sample values and confirm a 2xx response / correct output and correct `response_data` extraction.
4. Before any high-impact action — overwriting or deleting a live tool, overwriting a secret, or running `test_tool` against a real production endpoint with side effects — ask the user for explicit confirmation. Read-only inspection and sandbox/sample test runs do not need confirmation.
5. Final answer must include the tool id and type, the secret id used (if any), the `test_tool` outcome (status / extracted output), and where the tool was attached or that it is ready to attach via `/norm`.

Do not inline raw keys, and do not claim a tool works without a passing `test_tool` run. Do not invent ids or test results.
