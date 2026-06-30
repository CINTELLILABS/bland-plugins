---
description: Build or manage a Bland persona — pick a voice, set call config, attach knowledge and tools, route to pathways, then activate and promote.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Persona

Orchestrate the user's Bland persona request through the `norm_persona` agent, which owns the persona doctrine (voice selection, draft/production versioning, pathway routing, and the activate/promote flow).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_persona` agent (via the `Task` tool, `subagent_type: norm_persona`) and hand it the user request verbatim. Let it classify the work as create, edit, route, activate/test, promote, or inspect.
2. Have the agent pick a voice via `list_voices` by its description, then create or update the persona with `create_persona` / `update_persona` (`personality_prompt` plus `call_config.voice` are required; edits land on the draft).
3. Route the persona into its pathway with `link_pathway` using a named condition (the start node auto-resolves to the pathway's `isStart`); use `unlink_pathway` only when a route must be removed.
4. Before any high-impact action — `promote_persona` (it archives the previous production version), `unlink_pathway` (it changes live routing), or any real outbound call, message, delete, or publish — get explicit user confirmation. Read-only inspection and call-testing an activated draft never need it.
5. Final answer must include the persona id, the affected version (draft vs production) and its version id, the chosen voice, any pathway routing conditions linked or unlinked, whether the draft was activated, whether it was promoted to production, and any placeholder values the user must replace.

Do not invent voice ids, persona ids, version ids, or routing links when Bland tooling is available.
