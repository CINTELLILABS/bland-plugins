---
name: knowledge
description: "Use when the user wants a Bland v2 agent to know something: add a document, FAQ, website or file link as a knowledge source, test that retrieval returns the right facts, update or re-sync a source, answer the questions the agent could not, explain what it looked up on a call, attach a source to an agent version, or delete a source safely. Also use it to search the official Bland product documentation."
license: MIT
---

# Knowledge sources

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

A knowledge source is an org-wide document, FAQ or website indexed for retrieval. A v2 agent uses it only when a saved version lists its id, agent-wide in `knowledge.kbIds` or on a `knowledge` step. This plugin attaches sources to v2 agent versions only. Do not attach a source to a v1 pathway or a persona.

Read and follow the [knowledge sources skill](../../v2/skills/knowledge-sources/SKILL.md): ingest, poll, verify, attach by scope, test a source with answerable and absent questions, update a source by type, close the loop on unanswered questions, explain what was retrieved on a call, and delete a source only after naming every agent that uses it. Routes are in the [knowledge API](../../v2/skills/knowledge-sources/references/api.md); how a source reaches a live call is in [how it works](../../v2/skills/knowledge-sources/references/how-it-works.md).

## Docs versus knowledge

`search_bland_docs`, `get_bland_doc` and `query_docs_filesystem_bland` search the Bland product documentation. They are read-only reference about how features work, not the agent's runtime corpus. Do not answer "what will the agent say" from product docs.

## Guardrails

- Ingestion is not done until retrieval proves it. Quote the retrieved passages for two or three facts that only the new content could answer.
- An attachment is not done until the saved agent version lists the source id and a test of that version retrieves it.
- Deleting a source needs explicit approval, with every agent that uses it named.
