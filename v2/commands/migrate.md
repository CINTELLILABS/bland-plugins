---
description: Migrate a Bland v1 pathway or persona (raw JSON export) into a v2 agent, end to end — discovery, architecture, verbatim snapshot authoring, mechanical audit, push, and simulation verification. Use when the user wants to migrate, convert, or port a v1 pathway/persona to a v2 agent.
argument-hint: "[--upgrade] <path to v1 export JSON (and persona JSON), target agent id or org>"
allowed-tools:
  - "mcp__plugin_norm_bland__*"
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Bash"
  - "WebFetch"
---

# /norm:migrate — v1 → v2 migration

Run the full migration doctrine. The knowledge lives in this plugin's skills — load ALL FOUR before doing anything: `v2-migration` (doctrine + `references/traps.md`, read the traps in full), `v2-snapshot` (the target dialect), `v2-runtime` (behavior you must preserve), `v2-testing` (verification). Inside a subagent, Read the skill files from `${CLAUDE_PLUGIN_ROOT}/skills/` directly.

Request:

```text
$ARGUMENTS
```

## Select the contract before starting

If `$ARGUMENTS` contains `--upgrade`, use **outcomes-v1**: read
`skills/v2-migration/references/outcomes-v1.md` and follow its requirements,
authoring and evaluation procedure. Pass `--upgrade` to state `init` and every
audit invocation. This contract explicitly overrides conflicting verbatim/source-
bug preservation, materializer-only authoring, arbitrary scenario-count/hub-shape,
and latest-green simulation instructions below and in the referenced skills.
Preserve business requirements, mandatory wording and integrations; improve
conversation design and report suspected business-rule mistakes for owner review.
First read `skills/v2-migration/references/call-quality-v1.md`; its supplied
good-call/bad-call definitions govern the goals and design choices. Also read
`skills/v2-migration/references/bland-tone-v1.md` for the SERVER evals style
standard and its distinct evidence requirements. Then follow
the outcome-first design procedure in
`skills/v2-migration/references/upgrade-design-v1.md`: define successful calls,
choose the smallest reliable task architecture, then author and test it.
The hub owns most conversation and simple business logic. Scenarios isolate
bounded business use cases requiring strict steps, such as scheduling or complex
authentication, and return to the hub on completion or safe intent change. Use
the fewest nodes that preserve required behavior. Start is only for necessary
screening or automated pickup navigation, never the call body. No routing-only
hub plus catch-all workflow, no scenario per question/tool/department. Before
retaining an optional split, compare it with the consolidated hub on the same
frozen repeated suite; record exact versions and all attempts. A required ordered
permission/action boundary can justify a flow upfront. Prompt density alone
cannot: simplify instructions/tools and use correctly scoped knowledge first.
Before simulations run the audit, record/mirror the candidate design and end the
managed turn for platform preflight. Repair failures before launching the repeated suite.

When resuming, honor `.norm/migration.json`'s existing mode. An absent mode means
legacy migration; do not silently switch an existing run. Without `--upgrade`,
use the unchanged legacy phases below. Native `/norm:build` shares the hub-first
authoring guidance; it does not inherit the upgrade acceptance contract.

For upgrade, create reusable target-agent test scenarios and run
`record-evaluation --scenario <id>` (repeat for every scenario) **before the first
candidate push**. Mirror `evaluation: {scenario_ids: [...]}` into managed state;
the platform freezes the first list. In managed runs, mirror it and end the turn
for a platform checkpoint acknowledgement before the first push. Tests stay
frozen for the whole job; corrections require a new evaluation/migration run.
Each scenario has required `outcome:` and
`conduct:` assertions, the suite includes required `recovery:`, and optional
`quality:` scores are separate. Run all scenarios at least three times using
`POST /v1/agent-testing/simulation-sets` pinned with `agent_version_id`, without a
`request_data` override. All attempts count; never retry a failing candidate to
green. Inspect actual `metadata.agent_version_id` and `assertion_results`.

## Ground rules (hard)

- v1 resources are READ-ONLY and live. Never modify a pathway, persona, snippet, or tool. Exported secrets are live credentials — never print them; flag rotation.
- Additive only: you produce agent versions. Number attach/cutover is out of scope — refuse it.
- API surface: `GET` reads of the v1 export if not provided as files, `POST /v2/agents/:id/versions` for pushes, `/v1/agent-testing/*` and the test-chat WebSocket for verification. The key must belong to the OWNING org.
- No test that can fire a write-side integration (scheduler, CRM write, gate, outbound event) without an explicit safety plan the user approved.
- **Org-identity smoke check before the FIRST write**: multiple Bland connections can coexist in one session (a project-scoped server + this plugin's). Namespace alone proves nothing. Before pushing a version or creating scenarios, call `list_agents` (or `get_bland_mcp_setup`) through THIS plugin's server (`mcp__plugin_norm_bland__*`) and confirm the target agent id exists there and the org matches the engagement. On any mismatch, STOP and ask — a write into the wrong organization is the incident class this rule exists to prevent (BLA-7919).

## The convergence loop (enforced — not optional)

This command runs under a Stop-hook gate. On every stop attempt the hook re-runs the mode-specific audit live and checks local push/sim records; failures are re-fed as the next instruction. Legacy completion requires audit green, a version pushed after the last snapshot edit, and the full sim suite recorded green on that exact head. Upgrade uses these as advisory local readiness checks; managed completion also requires the platform's independent persisted-evidence evaluation.

Initialize it as soon as the snapshot file exists (legacy phase 3; upgrade uses the `--upgrade` initialization and pre-push evaluation procedure above):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" init \
  --snapshot snapshot.json --source v1-export.json [--persona persona.json] \
  --agent <agentId> --max 12
```

Record progress as it happens (the hook checks local records; managed upgrade completion independently verifies persisted evidence):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" record-push --head <versionId>
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" record-sims --head <versionId> --passed true|false [--failing "a;b"]
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" ack-uncovered --lane "<lane>: <why untestable>"
```

Any snapshot edit after a push automatically stales the head (gate 2) and resets the sim gate — that is the point: no result counts unless it ran on the bytes you're shipping. The audit itself is runnable any time:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migrate-audit.cjs" --snapshot snapshot.json --source v1-export.json [--persona persona.json]
```

Never game the gates: recording `--passed true` for a sweep you didn't run, or ack-ing a lane that was merely inconvenient, defeats the migration's only proof. The loop releases on complete, max-iter, stall (same failures 3 evaluations running), or 24h TTL — a legacy release by anything other than "complete" goes in the report as an incomplete migration. Upgrade releases use "local_complete" for advisory local readiness; only the platform can accept the persisted outcome evidence.

## Legacy phases — each gates the next

1. **Discover.** Census the export(s): node-type counts, orphans, dangling edge targets, the synthetic `global-prompt` node. Build the integration catalog (webhooks + auth, snippets + pinned versions, transfers, SMS, KBs, secrets, terminals) and classify each integration read vs write. Derive the request-data contract (consumed-never-produced variables, including any typo'd keys — carry them bug-for-bug). For personas: capture `personality_prompt`, `pathway_conditions`, `call_config`.
2. **Architect.** Region map → scenario list (every node in exactly one region; a tight loop lives in ONE flow). Hub source (triage node verbatim, or persona prompt = natural entry). Entry descriptions VERBATIM from source routing conditions. Each End Call becomes an `end-call` step in the flow of the node that routes to it (the builder does this); add a root end-call only for a hang-up the hub decides. A disposition for every legacy node id. Present this architecture to the user briefly before authoring.
3. **Author.** You author only JUDGMENT — a small `plan.json` (scenario membership, entry descriptions, hub prompt, system prompt assembled verbatim from the sources, and optional `voice` / `language` when the source persona does not carry them). The builder does ALL mechanical carriage:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-materialize.cjs" --plan plan.json --out snapshot.json
   ```

   It carries every byte from the v1 export(s): prompts, extraction variables, route rules (flat rows = OR, isGroup = AND, fallbacks from source), transfers with warm-transfer config, webhooks (headers/response mappings converted to the snapshot dialect), snippet pins, attached tools — and automatically re-represents `type:"code"` node tools as code step + route step. It namespaces node ids when merging multiple graphs, emits one exit edge per distinct label, appends the scenario directory to the hub prompt, and prints warnings you MUST read (uncovered nodes, code-tool input maps to review, cross-scenario tool targets cleared). Never hand-write flow JSON when the builder can carry it; edit the plan (or, for genuine hardening, the built snapshot) — not the mapping.
4. **Audit.** Run the `/norm:validate` checklist on the finished snapshot. Every check green before any push — including the pin grep: every source snippet id and tool id must appear in the final JSON.
5. **Push.** Before the FIRST push of a session, state what you are about to do — target agent id, the org identity confirmed by the smoke check, and the version name — and, in an interactive session, get an explicit go-ahead (autonomous/benchmark runs may declare autonomy in the brief instead; note it in the report). Then `POST /v2/agents/:agentId/versions` with `{"snapshot": ..., "name": "<meaningful version name>"}` into the owning org. Versions are additive (never destructive), but a push is still a persistent write into a customer org. A validation rejection is your authoring bug — fix and re-audit.
6. **Verify.** Run `/norm:simulate`: a suite of ~1 scenario per terminal/lane with completable personas and safety rails, judges worded per `v2-testing`, graded on engine traces, 3 reps on flappers, full-suite sweep green on one head. Then targeted test-chat probes for mechanics. Two disciplines that decide whether verification converges:
   - **Fixture discovery FIRST**: find the request data the customer's own test scenarios use for THIS pathway (group their existing scenarios by target pathway), and verify the fixture actually hydrates by tracing the bootstrap's debug/HTTP calls before grading any agent behavior. A stale or wrong-variant fixture produces failure clusters that look exactly like migration bugs.
   - **v1 differential baselines**: for any repeated failure, clone the scenario onto the v1 pathway and rep both. v1-solid + v2-failing = real regression (fix, at the construct level if prompt rules fail twice — see `silentPills`); v1-failing-identically = inherited variance (tighten the judge to v1's real bar, document the rate).
   Hardening goes through the builder's evidence-based hooks — `promptAppends`, `variableAppends`, `silentPills` in plan.json — never hand-edits to the snapshot, so every hardening decision is reviewable in the plan. After any snapshot change, drain write-side test artifacts (bookings etc.) with the customer's own cleanup utilities and verify at tool level.
7. **Report.** Dispositions · documented behavioral deltas · carried v1 defects · request-data contract · security flags (plaintext credentials) · and the explicit list of lanes NOT provable without the customer (data-gated lanes, write smokes). Never present the sim count as full coverage if a gated lane went unexercised.

## Legacy one-shot discipline

The goal is a working agent on the FIRST pushed version. That happens when: the traps file was read before authoring (not after a failure), all carriage is programmatic, the audit ran before the push, and sims are graded against the source system's real behavior. When a sim fails, classify (harness artifact / judge flake / routing flake / real bug) from the engine trace before touching anything — most first-batch failures are the harness, not the agent.
