# Norm for v2 Agents

The v2-only Bland plugin: build, migrate, validate, and test v2 agents working directly with raw JSON — v1 pathway exports as migration inputs, agent version snapshots as the output. No markdown scaffolding, no v1 authoring doctrine.

## Commands

| Command | What it does |
|---|---|
| `/norm:build` | Build a NEW v2 agent — starts with a human-in-the-loop gate (v1 pathway or v2 agent?); v1 answers route to the v1 plugin, v2 answers load the authoring doctrine and drive design → snapshot → push → verify. |
| `/norm:migrate` | Full v1 pathway/persona → v2 agent hand migration: discover → architect → author verbatim → audit → push → simulate. One-shot oriented; every known trap is a pre-push check. |
| `/norm:validate` | Mechanical audit of a snapshot JSON: structure, routing-crash checks, pin presence against the v1 source, exit-label discipline. |
| `/norm:simulate` | Simulation + test-chat verification loop with safety rails for live integrations and engine-trace grading. |

## The convergence loop (enforced)

`/norm:migrate` doesn't rely on the model choosing to iterate — a Stop hook gates the session until the migration is actually complete:

```
author snapshot ──► gate 1: AUDIT  (hook re-runs bin/norm-migrate-audit.cjs live:
        ▲                          structure + routing-crash + byte-parity vs the v1 source)
        │                 ▼ green
   failures re-fed    gate 2: PUSH  (a version recorded AFTER the last snapshot edit —
   as next            ▼ green        editing the snapshot stales the head automatically)
   instruction        gate 3: SIMS  (full suite recorded green ON that exact head)
        │                 ▼ green
        └────────────  RELEASE (complete)
```

- `bin/norm-materialize.cjs` — the deterministic BUILDER: the agent authors only judgment (a small `plan.json` — scenario membership, entries, hub + system prompt) and this script carries every byte of content from the v1 export(s) into the snapshot: prompts, extraction variables, route rules (flat = OR, isGroup = AND, fallbacks from source), transfers, webhooks, snippet pins, attached tools, automatic code-tool re-representation, id namespacing, per-label exit edges. Proven by rebuilding a shipped production migration from raw JSON alone: byte-class identical structure (same step census, same pins), passes the platform's own validator, and compiles to the identical graph (82 nodes / 143 edges) the in-repo pipeline produced.
- **Hardening hooks in the plan** — `promptAppends`, `variableAppends`, `silentPills`: evidence-based fixes discovered during the sim loop live in plan.json (reviewable), never as hand-edits to the snapshot. `silentPills` is the construct fix for a carried silent-router that fabricates speech as an in-flow step — proven in production when escalating prompt rules failed four runs straight.
- `bin/norm-migrate-audit.cjs` — the deterministic checker: 18 machine checks including pin-presence against every v1 snippet/tool id, OR-collapse and null-fallback scans, code-tool re-representation, verbatim prompt carriage. No model judgment.
- `bin/norm-migration-state.cjs` — loop state (`.norm/migration.json`): `init` / `record-push` / `record-sims` / `ack-uncovered` / `status` / `stop`.
- `bin/hook-migrate-loop.cjs` — the Stop gate. Fail-soft (never wedges a session); releases on complete, max-iter, stall (same failures 3 evaluations running), or 24h TTL — any release other than "complete" is reported as an incomplete migration.

## Skills (the knowledge base)

Written for agents WITHOUT access to the Bland platform source — everything is documented at the level of observable behavior and public API surfaces.

- **v2-authoring** — building NEW agents: what scenarios represent (boundaries at one-way seams), hub/entry authoring, the standard conduct-rule set (every rule from a real production incident), deterministic-where-it-matters, and the v1→v2 mental shift table.
- **v2-snapshot** — the exact snapshot dialect (behavior graph, hub, scenarios, step types, tools, settings) and hand-authoring rules.
- **v2-runtime** — how the agent behaves at call time: the routing decision stack, hub/scenario semantics, variable resolution, code-step execution, behavioral deltas.
- **v2-migration** — the migration doctrine + the trap catalog accumulated across production migrations (`references/traps.md`).
- **v2-testing** — the agent-testing API, test-chat WebSocket, grading discipline, and testing-safety rules.

## Relationship to the `bland` plugin

The original `bland` plugin covers the v1 surface (pathways, personas, and the file-workspace Norm builder). This plugin is intentionally separate so v2 work never inherits v1 doctrine. Install both if you work on both; v1 concepts appear here only as migration inputs.
