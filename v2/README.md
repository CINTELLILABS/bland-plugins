# Norm for v2 Agents

The v2-only Bland plugin: build, migrate, validate, and test v2 agents working directly with raw JSON — v1 pathway exports as migration inputs, agent version snapshots as the output. No markdown scaffolding, no v1 authoring doctrine.

## Commands

| Command | What it does |
|---|---|
| `/norm:migrate` | Full v1 pathway/persona → v2 agent hand migration: discover → architect → author verbatim → audit → push → simulate. One-shot oriented; every known trap is a pre-push check. |
| `/norm:validate` | Mechanical audit of a snapshot JSON: structure, routing-crash checks, pin presence against the v1 source, exit-label discipline. |
| `/norm:simulate` | Simulation + test-chat verification loop with safety rails for live integrations and engine-trace grading. |

## Skills (the knowledge base)

Written for agents WITHOUT access to the Bland platform source — everything is documented at the level of observable behavior and public API surfaces.

- **v2-snapshot** — the exact snapshot dialect (behavior graph, hub, scenarios, step types, tools, settings) and hand-authoring rules.
- **v2-runtime** — how the agent behaves at call time: the routing decision stack, hub/scenario semantics, variable resolution, code-step execution, behavioral deltas.
- **v2-migration** — the migration doctrine + the trap catalog accumulated across production migrations (`references/traps.md`).
- **v2-testing** — the agent-testing API, test-chat WebSocket, grading discipline, and testing-safety rules.

## Relationship to the `bland` plugin

The original `bland` plugin covers the v1 surface (pathways, personas, and the file-workspace Norm builder). This plugin is intentionally separate so v2 work never inherits v1 doctrine. Install both if you work on both; v1 concepts appear here only as migration inputs.
