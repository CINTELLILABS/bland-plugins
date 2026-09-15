---
description: Migrate a Bland v1 pathway or persona (raw JSON export) into a v2 agent, end to end — discovery, architecture, verbatim snapshot authoring, mechanical audit, push, and simulation verification. Use when the user wants to migrate, convert, or port a v1 pathway/persona to a v2 agent.
argument-hint: "<path to v1 export JSON (and persona JSON), target agent id or org>"
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Bash"
  - "WebFetch"
  - "mcp__bland__*"
  - "mcp__plugin_bland_bland__*"
---

# /norm:migrate — v1 → v2 hand migration

Run the full migration doctrine. The knowledge lives in this plugin's skills — load ALL FOUR before doing anything: `v2-migration` (doctrine + `references/traps.md`, read the traps in full), `v2-snapshot` (the target dialect), `v2-runtime` (behavior you must preserve), `v2-testing` (verification). Inside a subagent, Read the skill files from `${CLAUDE_PLUGIN_ROOT}/skills/` directly.

Request:

```text
$ARGUMENTS
```

## Ground rules (hard)

- v1 resources are READ-ONLY and live. Never modify a pathway, persona, snippet, or tool. Exported secrets are live credentials — never print them; flag rotation.
- Additive only: you produce agent versions. Number attach/cutover is out of scope — refuse it.
- API surface: `GET` reads of the v1 export if not provided as files, `POST /v2/agents/:id/versions` for pushes, `/v1/agent-testing/*` and the test-chat WebSocket for verification. The key must belong to the OWNING org.
- No test that can fire a write-side integration (scheduler, CRM write, gate, outbound event) without an explicit safety plan the user approved.

## Phases — each gates the next

1. **Discover.** Census the export(s): node-type counts, orphans, dangling edge targets, the synthetic `global-prompt` node. Build the integration catalog (webhooks + auth, snippets + pinned versions, transfers, SMS, KBs, secrets, terminals) and classify each integration read vs write. Derive the request-data contract (consumed-never-produced variables, including any typo'd keys — carry them bug-for-bug). For personas: capture `personality_prompt`, `pathway_conditions`, `call_config`.
2. **Architect.** Region map → scenario list (every node in exactly one region; a tight loop lives in ONE flow). Hub source (triage node verbatim, or persona prompt = natural entry). Entry descriptions VERBATIM from source routing conditions. 2–3 root end-calls. A disposition for every legacy node id. Present this architecture to the user briefly before authoring.
3. **Author.** Build the snapshot programmatically per `v2-snapshot`: scripts copy every prompt/condition/number/pin from source JSON — nothing hand-typed. Namespace ids when merging multiple graphs. Apply the mapping table (routes rebuilt flat-row=OR / isGroup=AND with source fallbacks; code-type attached tools → code step + route step; one exit edge per intent; KB stays node-scoped unless v1 was call-wide).
4. **Audit.** Run the `/norm:validate` checklist on the finished snapshot. Every check green before any push — including the pin grep: every source snippet id and tool id must appear in the final JSON.
5. **Push.** `POST /v2/agents/:agentId/versions` with `{"snapshot": ..., "name": "<meaningful version name>"}` into the owning org. A validation rejection is your authoring bug — fix and re-audit.
6. **Verify.** Run `/norm:simulate`: a suite of ~1 scenario per terminal/lane with completable personas and safety rails, judges worded per `v2-testing`, graded on engine traces, 3 reps on flappers, full-suite sweep green on one head. Then targeted test-chat probes for mechanics.
7. **Report.** Dispositions · documented behavioral deltas · carried v1 defects · request-data contract · security flags (plaintext credentials) · and the explicit list of lanes NOT provable without the customer (data-gated lanes, write smokes). Never present the sim count as full coverage if a gated lane went unexercised.

## One-shot discipline

The goal is a working agent on the FIRST pushed version. That happens when: the traps file was read before authoring (not after a failure), all carriage is programmatic, the audit ran before the push, and sims are graded against the source system's real behavior. When a sim fails, classify (harness artifact / judge flake / routing flake / real bug) from the engine trace before touching anything — most first-batch failures are the harness, not the agent.
