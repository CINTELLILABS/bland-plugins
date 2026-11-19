---
name: triage
description: "Use when the user wants to file, track or manage an issue found in a Bland v2 agent: report a problem from a bad call with its evidence, attach calls or conversations, comment, move status, link related or duplicate issues, or flag a platform capability gap."
license: MIT
---

# Triage issues

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

Turn a defect found in a v2 agent into a tracked issue with evidence, keep it moving, and link related issues. Issues can cite v1 calls and pathways as evidence; the fix for new work is always made on a v2 agent.

Read and follow the [triage issues skill](../../v2/skills/triage-issues/SKILL.md). Routes are in the [triage API](../../v2/skills/triage-issues/references/api.md); the lifecycle is in [how it works](../../v2/skills/triage-issues/references/how-it-works.md).

## Issue quality bar

- A factual one-line title, a severity with its reason, and evidence attached as resources: call ids, the agent id and version, and the step or edge ids.
- A deterministic repro, or a plain statement that none exists yet.
- From a debugging session, the hypotheses tested and ruled out. File the debug skill's triage pack as written.
- Search for duplicates first and extend an existing issue instead of filing a new one.
- Read the issue back and quote its id and status. Closing, reclassifying, detaching evidence and deleting need approval.
- Never write `@norm` into a comment.
