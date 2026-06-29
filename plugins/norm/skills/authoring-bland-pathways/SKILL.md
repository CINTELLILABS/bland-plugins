---
name: norm-pathway-workflow
description: Use when Norm creates, edits, simulates, tests, debugs, commits, publishes, or inspects Bland agents and pathways — authoring prose in local pathway files and driving structured edits, validation, and persistence through Bland MCP and the /norm:* commands.
---

# Authoring Bland Pathways

A Bland pathway is worked on as a **local workspace of files** (the canonical engine layout, below). There are two editing surfaces, and the source of truth differs by surface:

- **Prose is authored in local files** — node prompts, conditions, edge labels, and the global prompt are edited directly with native `Read` / `Write` / `Edit` / `Glob` / `Grep`. The file on disk is the source of truth.
- **Structure, validation, and persistence go through Bland MCP / `/norm:*`** — variables, model config, node tools, and unit tests are edited only through MCP structured tools; validate, test, clone, and commit are server round-trips driven by the `/norm:*` commands. The server is the source of truth for these.

Do not hand-write the structured YAMLs. Do not treat a clean local file tree as a saved pathway — only a commit persists.

## Canonical workspace layout (match exactly)

```
nodes/<slug>/node.md          # frontmatter (id, type, name, [isStart]) + body = node prompt   [PROSE: native edit]
nodes/<slug>/condition.md     # optional — body = routing condition                            [PROSE: native edit]
nodes/<slug>/variables.yaml   # optional — { variables: [{ name, type, description }] }         [STRUCTURED: set_variables]
nodes/<slug>/model.yaml       # optional — model options map                                    [STRUCTURED: set_model_config]
nodes/<slug>/tools.yaml       # optional — { tools: [...] }                                     [STRUCTURED: set_node_tools]
nodes/<slug>/unit-tests.yaml  # optional — per-node test scenario                               [STRUCTURED: set_unit_tests]
nodes/<slug>/tag.yaml         # optional — { name, color }
edges/<srcSlug>-to-<tgtSlug>.md   # frontmatter (id, source, target, sourceName, targetName) + body = label   [PROSE body: native edit]
.pathways/global_prompt.md    # raw markdown, NO frontmatter — the global/system prompt          [PROSE: native edit]
.pathways/layout.yaml         # { positions: { <slug>: { x, y } } }                              [AUTO-DERIVED: never touch]
.pathways/config.yaml         # reserved; emitted as `{}`
```

- `slug` = first 8 hex chars of the node's UUID `id` (`id.replace(/-/g,"").slice(0,8)`), stable across renames; `node.md` frontmatter carries the full UUID.
- Exactly one start node (`isStart: true`). Every node reachable from it.
- No `manifest.yaml` on disk — it is rebuilt live from node/edge files at compile time.
- `.pathways/global_prompt.md` has no frontmatter; adding `---` corrupts it.
- `.pathways/layout.yaml` is auto-derived — never read it for meaning, never write it.
- YAML scalar gotcha: a slug shaped `<digits>e<digits>` (e.g. `631e5943`) must be quoted wherever it is a YAML scalar value or map key — another reason structured YAMLs go through MCP, not by hand.

## Surface routing (which tool for which edit)

| You are changing… | Surface | How |
|---|---|---|
| a node prompt | `nodes/<slug>/node.md` body | native `Edit`/`Write` |
| a routing condition | `nodes/<slug>/condition.md` body | native `Edit`/`Write` |
| an edge label | `edges/<src>-to-<tgt>.md` body | native `Edit`/`Write` |
| the global prompt | `.pathways/global_prompt.md` | native `Edit`/`Write` |
| variables | `nodes/<slug>/variables.yaml` | `set_variables` (never hand-write) |
| per-node model | `nodes/<slug>/model.yaml` | `set_model_config` (never hand-write) |
| node tools | `nodes/<slug>/tools.yaml` | `set_node_tools` (never hand-write) |
| per-node unit tests | `nodes/<slug>/unit-tests.yaml` | `set_unit_tests` (never hand-write) |
| node positions | `.pathways/layout.yaml` | never — auto-derived |
| clone / validate / test / commit | server | `/norm:*` commands |

You may `Read` a structured YAML to understand current state, but editing it by hand is a bug.

## New pathway

1. Begin generation and clone the workspace (create flow under `/norm:*`).
2. Author the minimal complete flow as **prose files**: start `node.md`, core task nodes, fallback/transfer when needed, an ending behavior, `condition.md` routes, edge labels, and `.pathways/global_prompt.md`.
3. Add **structured** surfaces via MCP: `set_variables`, `set_model_config`, `set_node_tools`, `set_unit_tests`.
4. Validate (`/norm:validate`).
5. Fix validation errors and re-validate.
6. Test when useful: Agent-to-Agent Testing for full simulated conversations; Test Bed for focused node/runtime checks.
7. Commit after validation errors are resolved.

## Existing pathway

1. List/get the pathway if the target or version is unclear, then clone/checkout via the edit flow under `/norm:*`. If the server may be ahead, re-clone first (see Drift).
2. Gather semantics context (`get_pathway_dependency_context`, `get_node_execution_context`, `get_transition_context`) before editing routing, transfer, fallback, or tool behavior.
3. Apply the smallest correct edit on the correct surface (prose → native; structure → `set_*`).
4. Validate, fix errors, test when useful, then commit.

## Validation and commit

- Run validation after meaningful structural or prose changes; fix **errors** before tests or commit.
- Keep **warnings** visible and explain them. Missing End Call is advisory — don't add a node just to silence it.
- After a clean validation pass, commit in the same run. Never ask "should I save it?" after clean validation.
- New-pathway commits promote the generated version to production. Edit commits may save a working version without promoting production — don't claim production changed unless the result says so.
- A clean local file tree is not a saved pathway. The commit is the real persistence boundary; never describe an uncommitted workspace as finished.

## Simulation and testing

- For "simulate a conversation", "test chat", or end-to-end verification, use Agent-to-Agent Testing: `create_agent_test_scenario`, `run_agent_test_scenario`, `get_agent_test_run`.
- For one node, webhook, prompt, route, extraction, or seeded-call behavior, use Test Bed: `run_pathway_node_test`, then poll `get_pathway_node_test_results`.
- Do not hand-simulate or call external webhooks manually when these tools are available.
- Do not claim a test passed until a Bland test-result tool returns the status, transcript/assertions, or score.

## Debugging

1. Reproduce or locate the failure with runtime evidence (call log, seeded node test, agent-to-agent run) — not by re-reading prose and guessing.
2. Form the dependency picture with the semantics tools.
3. Localize the defect to one surface (prompt / condition / edge label / tools / variables / model).
4. Apply the smallest fix on that surface (prose → native edit; structure → `set_*`).
5. Re-validate and re-test the same way you reproduced the bug before claiming a fix.

## Drift

The local workspace is a checkout at a point in time. If the live server version is ahead — another editor changed the pathway, a prior commit promoted a new version, or a server op / `/norm:sync` reports a newer version — **re-clone before editing further**. Treat a version mismatch as a stop-and-re-clone signal, not something to force. Re-clone via the `/norm:*` checkout flow, re-apply in-progress prose edits on top of the fresh files, then re-validate. When unsure whether the workspace is current, run `/norm:sync` before editing.

## High-impact actions

Before any real outbound call/message, delete, publish, promote, cancellation, or tag application, ask the user for explicit confirmation. Simulations, validation, and read-only inspections do not need it.
