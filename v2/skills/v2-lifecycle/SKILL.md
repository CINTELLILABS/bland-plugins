---
name: v2-lifecycle
description: The Bland v2 agent lifecycle — environments (dev/staging/production), publish/promote/rollback, which version answers each channel at call time, branches and merging, A/B experiments, environment variables ({{env.KEY}}), pre-deploy checks, inbound number binding and the twin-pathway fallback. Use when shipping an agent version to real traffic, wiring numbers, gating a promotion, or answering "which version is this call running".
---

# v2 Agent Lifecycle

> **Server binding (v1/v2 isolation):** all API work in this skill goes through THIS plugin's MCP server only (`plugin_norm_bland` — `mcp__plugin_norm_bland__*` on Claude Code). Never call the v1 plugin's server or a project-scoped `bland` server, even though they expose similar tools — they may be authenticated to a DIFFERENT organization. Identity is proven by the org smoke check, never by tool namespace.

Full endpoint dictionary (bodies, responses, error codes): `references/api.md`. This file is the mental model.

## The environment model

Every agent has exactly three fixed environments — `dev`, `staging`, `production` — created with the agent, never configurable.

- **dev is never pinned**: it always means "the newest version on the trunk timeline" (the head). Saving a version IS deploying to dev.
- **staging and production are pins**: a pointer at one immutable version row. A freshly created agent has both unpinned — **a call to an agent with no production pin fails** (`AGENT_ENV_UNPINNED`), it does not fall back to the head.

## The ship pipeline

```
save version ──► dev (automatic)
  publish ─────► staging   (mints semver X.Y.Z; the ONLY place semvers are born)
  promote ─────► production (no body: production := whatever staging points at)
  rollback ────► production (repoint at any PREVIOUSLY-DEPLOYED production version)
```

- **Publish** moves ONLY staging. Three body modes: `{snapshot}` (save new version + publish it), `{version_id}` (publish an existing one; `branch_id` alongside publishes a branch head directly — the branch stays open), `{}` (publish the dev head). `bump: patch|minor|major` (default patch) mints the next semver above the MAX ever minted; re-publishing an already-published version re-records its original semver, never re-mints.
- **Promote** takes NO parameters. It cannot skip staging and cannot choose a version. 400 `STAGING_UNPINNED` when staging is empty.
- **Rollback** = `{version_id}` that already has a production deployment row; `already_current` and `not_previously_deployed` are 400s. `GET /deployments?env=production` rows carry `is_rollback_eligible` — that list IS the valid candidate set.
- Every staging/production repoint appends an immutable **deployment row** (`GET /deployments`) — the audit history. dev never writes one.
- Version naming matters: a **named** version is pinned forever; an unnamed save is an autosave head that later autosaves coalesce into (its snapshot can be rewritten in place). Always name versions you intend to reference.

## Which version answers — per channel

| Channel | Default | Override |
|---|---|---|
| Outbound `POST /v1/calls` + `agent_id` | **production pin** | `agent_version` selector |
| Inbound voice (bound number) | **production pin** (or a live experiment arm) | none per-call |
| Web chat / test-chat socket | **dev head** ("a chat surface shouldn't need a deploy") | `agent_chat_version` |
| Builder preview | dev head | — |
| SMS on a bound number | **the twin pathway's stored graph** — no per-call resolution at all (see below) | none |

Selector grammar (`agent_version`): `production` \| `staging` \| `dev`/`latest` \| a minted semver `X.Y.Z` \| `branch:<name>`.

**The selector — not the version — decides which environment's variables resolve.** Env labels resolve their own env; a semver, `branch:`, or `dev` selector ALWAYS resolves dev variables, even when that exact version is the production pin. Testing a version by semver therefore does not prove its production variable set.

**Test-chat runs the dev head by default.** A green test-chat sweep proves the head, not what customers hear — publish + promote (or pass an explicit selector) before claiming production parity.

## Inbound binding, the twin, and fail-open

Attaching numbers (`POST /:agentId/inbound/attach {inbound_numbers}`) does not bind number→agent directly: it bridges over the v1 runtime by materializing a **twin pathway + twin persona** tagged `v2-agent:<agentId>` and pointing the number's inbound row at them.

- At call time the resolver has a **2-second budget and is fail-open**: any error, timeout, unpinned production, invalid snapshot, or unresolved env variable silently degrades the call to the **twin pathway's stored graph** — unattributed to the agent version.
- **The twin's stored graph updates on exactly two events**: an attach/re-attach (compiles the **dev head** of that moment) and any **production repoint** — promote or rollback — (compiles the **production pin**). Publish does not touch it; between those events it is stale. So a degraded or frozen-fleet inbound call can run an old compile: keep production pinned and valid, and promote to refresh the twin.
- **SMS always runs the twin's stored graph** (never per-call version resolution) — an SMS agent's behavior changes only on those same two events, so a freshly attached number runs dev-head behavior until the first promote. Plan SMS verification after promote, not after publish.
- One number binds ONE agent (rebinding overwrites); one agent can hold many numbers. Compiled inbound routes cache ~60s (production/staging keys are invalidated on repoints, variable writes, attach/detach).

## Branches

A branch is a **dev workspace**, never a deployable line of its own. Names: 1–64 chars of `[A-Za-z0-9._-]`, and never `dev|latest|staging|production` or anything shaped like a semver (they'd shadow selectors).

- Cut from the current dev head (`base_version_id`). Save onto it with `branch_id` on the version POST; read with `?branch=`.
- **Merge is fast-forward-only squash**: produces exactly ONE new dev version carrying the branch head's snapshot; 409 `BRANCH_BEHIND` when dev moved — run **rebase-preview** (three-way merge dry run) then **rebase** `{dev_head_version_id, resolutions}` (resolutions: `"ours"` = branch, `"theirs"` = dev, or `{value}`). Rebase writes to the BRANCH and advances its base; then merge fast-forwards. Order-sensitive routing arrays (`conditions`, `responsePathways`) and `position` conflict atomically — they are never element-merged.
- A branch head can run live traffic two ways without merging: dial it via selector `branch:<name>` (resolves DEV variables), or publish it straight to staging with `{version_id, branch_id}` (409 `BRANCH_CLOSED` if the branch merged/was deleted).

## Experiments (A/B)

One active experiment per agent: `{variant_version_id, traffic_percentage 1–100, baseline_env (default production), run_hours?, starts_at?/ends_at?, variant_call_quota?}`. The variant is dry-run compiled at creation — a broken variant is a 400 now, not a fail-open surprise later.

- Only **selector-less** calls are eligible; any explicit `agent_version` (even `"production"`) bypasses and is never attributed. Outside run-hours/quota/dates, calls run the baseline arm but stay attributed. Unanswered outbound calls never consume quota. Fail-open throughout.
- The baseline is the ENV POINTER, so any publish/promote/rollback that repoints the baseline env **auto-completes the experiment** (`baseline_changed`) in the same transaction. That is also how a winner ships: **there is no winner endpoint** — promote the variant normally ("variant won") or `POST /experiments/:id/stop` and do nothing ("baseline won"). Only `traffic_percentage`, dates, run_hours, quota are PATCHable; variant and baseline are immutable.

## Environment variables — `{{env.KEY}}`

Per-(agent, env) key/values. Keys: `[A-Za-z0-9_]+` — **no dots** (the resolver splits on dots; a dotted key never resolves).

- The namespace is disjoint from call variables BY DESIGN: `{{env.KEY}}` is substituted into the snapshot at prepare/compile time, before the call exists; plain `{{key}}` remains the per-call namespace (request_data / extractions). They cannot collide, and request_data cannot shadow an env var.
- **Unresolved is a hard, loud failure**: any referenced `{{env.KEY}}` with no value in the resolving env fails the call preparation (`AGENT_VARIABLE_UNRESOLVED`) — it never passes through as a literal (unlike plain `{{key}}`, which does).
- `{is_secret: true}` stores the value in the org secret store and keeps only a `{{SECRET.name}}` reference in the row; reads return the reference, never the value; secrets expand live at runtime and never land at rest.
- A whole-string `{{env.KEY}}` is accepted even where the validator expects a typed field (e.g. `contact.inboundNumbers`).

## Checks — advisory gates you must enforce yourself

A check config per (agent, `staging`|`production`): 1–5 agent-testing scenarios × judge evals (`required` defaults true), `simulations_count` per scenario (default 5, max 50). `POST /environments/:env/check-runs` (body `{version_id?}`) runs simulations against the pinned candidate and scores them in one eval run. Default candidate = what a promotion into that env would deploy: **staging's pin for production, the dev head for staging**.

- Statuses `PENDING→RUNNING→PASSED|FAILED|ERROR|CANCELLED`; `overall_passed` = every REQUIRED judge ≥ 0.5 match rate (no required judges = vacuously passed).
- **The server NEVER blocks publish/promote on a check.** Deployment rows merely display the latest run. The discipline: start a run, poll to terminal, and only promote on PASSED — the gate is yours to enforce.
- One active run per (agent, env) — a wedged run 409s new starts until cancel or the 45-minute stale reaper.

## The rest of the surface (see references/api.md)

- **Agent CRUD**: create takes `{name}` only (config lives in versions); PATCH renames only; DELETE is soft; list has only `?limit`.
- **Version reads**: `GET /versions/latest` = full snapshot (the export — see api.md); `GET /versions/:semver` takes a minted `X.Y.Z` ONLY (published versions only — never a version row id); `GET /versions` = metadata list. Concurrent-editor saves use the `parent_version_id`/`parent_revision` fence (409 `STALE_HEAD`).
- **Identity / branded calling**: per-agent contact card (logo, vCard) + BCID submission to carrier review (T-Mobile/Verizon) — an org-external registry write; treat as a customer-approval action.
- **Memory**: `settings.enableMemory` + `settings.memorySchema` (entity schemas); `GET/POST /memory/schema[/infer]` — infer persists nothing, the builder saves the result into settings. Inbound/SMS memory gates on the TWIN persona's copy, refreshed on promote.
- **Library**: `GET /library/scenarios` (reusable scenario nodes read live from the org's other agents' dev heads) and archived nodes (self-contained copies; archive never edits the canvas).
- **Platform migration endpoints**: `POST /v2/agents/migrate` (LLM planner, 10/hr, dry-run by default), `/migrate/pathways` (deterministic 1:1, ≤20), `/migrate/persona`, async `/migrate/translations` (202 + poll). These are the platform's OWN converters — `/norm:migrate` is the hand doctrine and does not use them, but know they exist when a customer mentions "the migrate button".
