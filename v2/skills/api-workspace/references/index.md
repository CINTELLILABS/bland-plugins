# Norm product wiki

Start with the row matching the task. Open that reference, not every file in
this index. Local references explain behavior; the connected tool schema and
current official API documentation determine the request that can be sent.

For the complete navigation/coverage map, including all node families,
dispositions, external resources and operational surfaces, read the
[v2 surface map](surface-map.md).

| Task / question | Read |
|---|---|
| Find an endpoint; use API tools from code; recover a failed request | [API workspace skill](../SKILL.md), [API contract](api.md) |
| Which state am I editing? Why does the dashboard look stale? | [Workspace and page state](workspace.md) |
| Why do nodes look disconnected? What does this JSON edit change in the UI? | [Builder JSON → runtime → canvas](../../v2-runtime/references/builder-runtime-map.md) |
| Is this audio barge-in, a topic change, or a global-node jump? | [Interruption mechanisms and setting scope](../../v2-runtime/references/interruptions.md) |
| Build a new v2 agent and choose scenario boundaries | [Authoring](../../v2-authoring/SKILL.md) |
| Update, debug, or manage an existing v2 agent without overwriting other work | [Maintenance](../../v2-maintenance/SKILL.md) |
| Write or validate snapshot JSON, steps, tools, and edges | [Snapshot dialect](../../v2-snapshot/SKILL.md) |
| Find an option, default, override, or field interaction | [Option guide](options.md), [field dictionary](../../v2-snapshot/references/knobs.md) |
| Why did the agent choose this node or miss a tool? | [Execution order](execution.md), [runtime](../../v2-runtime/SKILL.md), [debugging](debugging.md) |
| Build a judge, attach a test case, run evaluations | [Evaluations skill](../../evaluations/SKILL.md), [evaluation workflow](../../evaluations/references/workflows.md), [API map](../../evaluations/references/api.md) |
| Simulate a caller or investigate a test result | [Testing](../../v2-testing/SKILL.md) |
| Test actual audio, interruptions, recovery, or response latency | [Voice evidence](../../v2-testing/references/voice.md) |
| Analyze hundreds or thousands of calls with code | [Call analysis skill](../../call-analysis/SKILL.md), [retrieval and pagination](../../call-analysis/references/retrieval.md), [analysis recipe](../../call-analysis/references/analysis.md) |
| Save, publish, promote, rollback, branch, or select a version | [Lifecycle](../../v2-lifecycle/SKILL.md), [lifecycle API](../../v2-lifecycle/references/api.md) |
| Migrate v1 content into v2 without changing its meaning | [Migration](../../v2-migration/SKILL.md) |

## What this package is—and is not

- Customer-facing product semantics, task procedures, and API navigation.
- No private platform source, runtime credentials, or production data is needed
  to use these references.
- Not a complete offline copy of every API schema. For an option or endpoint
  not documented here, retrieve the official contract through the docs tools.
- Not an authorization system. The connected API and host enforce access.
- Not an automatic file synchronizer. See the workspace reference before saving.
- Not proof that a capability is enabled for this account. A documented feature
  can still be unavailable; surface that limitation rather than inventing it.
