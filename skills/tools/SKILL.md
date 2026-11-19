---
name: tools
description: "Use when the user wants to build, test, update, debug or delete a custom tool or integration a Bland v2 agent calls mid-conversation (a REST API tool, a webhook, a CRM or calendar action, custom code), manage the secrets or connections a tool uses, find which agents use a tool, or explain what the caller hears while it runs. Tools are proved by a real run before they are attached to a v2 agent version."
license: MIT
---

# Tools, secrets and connections

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

Tools run mid-conversation inside a v2 agent. This plugin attaches tools to v2 agent versions only. Do not attach a tool to a v1 pathway node or a persona.

Read and follow the [tool library skill](../../v2/skills/tool-library/SKILL.md). It owns the workflows: create and prove a tool (including the HTTP 0 trap), save custom code as a pinned snippet version, change a shared tool after finding every consumer, debug a run from tool logs, delete a tool safely, reference secrets by id, and connect or disconnect an integration. The definition schema and routes are in the [tool contract](../../v2/skills/v2-runtime/references/tool-library.md); runtime behavior is in [how tools work](../../v2/skills/tool-library/references/how-it-works.md).

Before you write a tool's schema, description or the prompt that calls it, check whether the agent's running version uses [native function calling](../../v2/skills/v2-runtime/references/native-function-calling.md). On native steps a tool whose schema fails native normalization (a non-object root, `$ref`, `oneOf`, `anyOf`, `allOf` and similar keywords, or a `required` name that is not a declared property) is not offered. The runtime replaces characters other than letters, digits, `_` and `-` in a tool name with `_` and cuts it at 64 characters; a later tool whose normalized name matches an earlier one, ignoring case, is not offered. The [rules](../../v2/skills/v2-migration/references/native-tool-calling-v1.md) list every limit.

The org tool library has two route families: `/v1/tools` for custom HTTP tools and `/v2/tools` for integration tools. Both serve v2 agents. The named `create_tool`, `update_tool` and `list_tools` tools cover `/v2/tools` integration tools, NOT the `/v1/tools` custom HTTP tools; do not infer one from the other.

## Guardrails

- Never put a raw key, token or password in a tool. Reference a secret by id.
- Never run a tool against a real system that writes, sends or charges without the user's approval.
- A saved tool is not a working tool: quote a real run's response and the extracted values before you attach it, and test the agent version after you attach it.
- Report the tool id, its consumers, the run evidence and the agent version it was attached to.
