---
description: Build and query Bland knowledge bases the agent can retrieve from and cite mid-call — ingest, verify retrieval, and attach to a persona or pathway.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm Knowledge

Orchestrate the user's knowledge-base request through the `norm_knowledge` agent, which owns the doctrine (ingest, verify retrieval, attach so the agent can cite mid-call, and docs vs KB).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_knowledge` agent (via the `Task` tool, `subagent_type: norm_knowledge`) and hand it the user request verbatim. Let it classify the work as build a KB, extend a KB, verify retrieval, attach a KB, or search the Bland docs.
2. Have the agent inspect existing knowledge first (`list_knowledge_bases`, `get_knowledge_base`) before ingesting with `learn_kb_text` or `learn_kb_web`, so it extends the right KB instead of duplicating one.
3. Require the agent to verify retrieval with `query_knowledge_base` or `search_kb` — asking a real caller question and confirming the correct passage returns — before calling the KB ready, then attach it via `kb_ids` to the persona or pathway.
4. Before any high-impact action — `delete_kb_doc`, or anything that mutates production, sends messages, makes real outbound calls, or costs money — get explicit user confirmation. Read-only inspection and retrieval verification never need it.
5. Final answer must include the KB id, what was ingested (source type/scope), the verification questions and whether the right passage returned, where the KB was attached (`kb_ids` target), and any deletions performed only after confirmation.

Do not invent KB ids, retrieved passages, or verification results when Bland tooling is available.
