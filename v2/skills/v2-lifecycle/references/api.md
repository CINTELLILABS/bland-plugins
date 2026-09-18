# The v2 agent API — endpoint dictionary

Base: `/v2/agents`. Auth: the org's API key. Writes require an editor role (admin/owner/operator/prompter). Responses use the `{data, errors}` envelope. Literal segments (`/library/*`, `/migrate*`) resolve before `/:agentId`.

## Agents

| Endpoint | Body / query | Returns | Notes |
|---|---|---|---|
| `POST /` | `{name}` (non-empty) | 201 `{agent, environments[3]}` | Nothing else accepted — all config lives in versions. Creates dev/staging/production rows, all unpinned. |
| `GET /` | `?limit` (1–500, default 100) | agent rows + `color` (from newest trunk snapshot) + `twin_pathway_id` (null = no number bound) | Only filter is limit; ordered `updated_at desc`. |
| `GET /:agentId` | — | agent row + `environments` | NO snapshot/settings here — fetch a version for config. |
| `PATCH /:agentId` | `{name}` | updated row | Rename is the ONLY agent-level mutation. |
| `DELETE /:agentId` | — | `{id, deleted:true}` | Soft delete; versions/history retained; the agent's alert configs are disabled with it. |

## Versions

| Endpoint | Body / query | Returns | Notes |
|---|---|---|---|
| `POST /:agentId/versions` | `{snapshot!, name?, branch_id?, autosave?, parent_version_id?, parent_revision?}` | 201 full version row (+`warnings[]`) | Validator: ≤2 MiB serialized, unique node ids, edge integrity, flow nesting ≤10, guardrail rules, `contact.inboundNumbers` (array or whole-string `{{env.KEY}}`). Named version = pinned forever; unnamed = coalescing autosave head. `parent_*` = optimistic-concurrency fence → 409 `STALE_HEAD` (+`head_version_id`,`head_revision`). No semver here — publish mints it. |
| `GET /:agentId/versions/latest` | `?branch=` | full row incl. `snapshot` | **The whole-agent JSON export.** Dev head, or branch head (falls back to the branch's base). |
| `GET /:agentId/versions/:semver` | — | full row incl. snapshot | `:semver` is a minted `X.Y.Z` string — never a row id, no `v` prefix. Only PUBLISHED versions are addressable → 400 `INVALID_VERSION` / 404. |
| `GET /:agentId/versions` | `?branch=&limit=` (default 50, max 200) | metadata only `{id, name, created_via, created_by, created_at, semver\|null}` | `semver` = first deployment's mint. |

## Lifecycle

| Endpoint | Body | Returns | Errors |
|---|---|---|---|
| `POST /:agentId/publish` | `{snapshot, bump?}` \| `{version_id, bump?, branch_id?}` \| `{bump?}` (dev head) | 201 `{version, semver, environments}` (200 when `already_published`) | 400 `INVALID_BUMP`/`INVALID_SNAPSHOT`/`NO_VERSIONS`, 404 `VERSION_NOT_FOUND`, 409 `PUBLISH_IN_PROGRESS`, 409 `BRANCH_CLOSED` (branch merged/deleted). Moves STAGING only. `bump` default `patch`; mints above the max semver ever minted. |
| `POST /:agentId/promote` | — (none) | 200 `{semver, environments}` | 400 `STAGING_UNPINNED`. production := staging's pin; re-records original semver; checks-free by design. Refreshes the twin pathway + invalidates inbound route cache. |
| `POST /:agentId/rollback` | `{version_id}` | 200 `{semver, environments}` | 400 `already_current` / `not_previously_deployed`. Production only; candidates = `is_rollback_eligible` deployment rows. |
| `GET /:agentId/environments` | — | 3 rows `{env_type, current_version_id, current_version:{name,semver}\|null}` | dev is always null. |
| `GET /:agentId/deployments` | `?env=` (default production) `&limit=` (default 50, max 200) | newest-first `{env_type, agent_version_id, version_name, semver, deployed_by, deployed_at, check_run\|null, is_rollback_eligible}` | Append-only history; never written for dev. |

## Branches

| Endpoint | Body | Returns | Errors |
|---|---|---|---|
| `POST /:agentId/branches` | `{name}` (1–64 `[A-Za-z0-9._-]`, not an env label or semver shape) | 201 branch + `behind:false` | 409 `BRANCH_EXISTS` (open branches only). Base = current dev head. |
| `GET /:agentId/branches` | — | open branches, each with `behind` (base ≠ dev head) | `behind:true` ⇒ merge would 409. |
| `DELETE /:agentId/branches/:branchId` | — | soft delete (abandon) | Branch versions retained. |
| `POST …/:branchId/merge` | — (none) | ONE new squashed dev version; branch stamped merged | 409 `BRANCH_BEHIND` (rebase first), 400 `NO_CHANGES`, 409 `MERGE_IN_PROGRESS`. Fast-forward only. |
| `POST …/:branchId/rebase-preview` | — | `{dev_head_version_id, up_to_date, auto_merged, changes, conflicts}` | Dry-run three-way merge (base/branch/dev). |
| `POST …/:branchId/rebase` | `{dev_head_version_id, resolutions?: {<conflictId>: "ours"\|"theirs"\|{value}}}` | new version ON THE BRANCH; base advances to that dev head | 409 `REBASE_STALE` (dev moved since preview), 400 `UNRESOLVED_CONFLICTS` (returns them), 400 `INVALID_MERGE`. "ours"=branch, "theirs"=dev. `conditions`/`responsePathways`/`position` conflict atomically. |

## Experiments

| Endpoint | Body | Notes |
|---|---|---|
| `POST /:agentId/experiments` | `{variant_version_id!, traffic_percentage! (1–100), baseline_env? (production\|staging, default production), run_hours? {timezone, days:{mon:{start,end},…}}, starts_at?, ends_at?, variant_call_quota? (≤1M)}` | 409 `already_active` (one per agent), 400 `baseline_unpinned`/`variant_is_baseline`/`variant_invalid` (the variant is dry-run compiled NOW). |
| `GET /:agentId/experiments[/:id]` | — | Active rows report the live routed count; completed rows the final. Statuses: `active`/`completed` (`completed_reason`: manual, date_ended, quota_reached, baseline_changed). |
| `PATCH /:agentId/experiments/:id` | ONLY `{traffic_percentage?, run_hours?, starts_at?, ends_at?, variant_call_quota?}` | Variant + baseline immutable. 409 on completed. |
| `POST /:agentId/experiments/:id/stop` | — | `completed_reason: manual`. |

No winner endpoint: promote the variant (baseline repoint auto-completes as `baseline_changed`) or stop.

## Environment variables

| Endpoint | Body | Notes |
|---|---|---|
| `GET /:agentId/environments/:env/variables` | — | `[{variable_key, value, updated_at}]`; secret values come back as their `{{SECRET.name}}` reference. |
| `PUT …/variables/:key` | `{value!, is_secret?}` | Key must match `[A-Za-z0-9_]+` (no dots). `is_secret:true` stores the raw value in the org secret store; only the reference persists. Production writes invalidate the inbound route cache. |
| `DELETE …/variables/:key` | — | `{deleted:true}`; backing secret cleaned up best-effort. |

`:env` here is all three (dev/staging/production). Referenced-but-missing `{{env.KEY}}` fails call preparation loudly.

## Checks

| Endpoint | Body | Notes |
|---|---|---|
| `GET/PUT/DELETE /:agentId/environments/:env/checks` | PUT: `{enabled?, scenario_ids! (1–5, this agent's, non-pathway), simulations_count? (1–50, default 5), evals!: [{eval_agent_id, eval_agent_version_id, target_level_keys?, required? (default true)}]}` | `:env` = staging\|production only. Full replace; GET returns `null` when unconfigured. Graded evals need `target_level_keys`; pass/fail must omit. |
| `POST /:agentId/environments/:env/check-runs` | `{version_id?}` | 202 PENDING run. Default candidate: staging pin (for production) / dev head (for staging). 400 `no_config`/`invalid`/`no_candidate`; 409 one-active-per-env (45-min stale reaper). Config frozen into the run. |
| `GET /:agentId/check-runs?env=&limit=` (default 25/max 100) · `GET …/check-runs/:runId` · `POST …/check-runs/:runId/cancel` | — | Run carries `simulation_set_id`/`eval_run_id` deep links, `verdicts[]`, `overall_passed` (= all REQUIRED judges ≥0.5 match rate). NEVER gates publish/promote server-side. |

## Inbound numbers & identity

| Endpoint | Body | Notes |
|---|---|---|
| `GET /:agentId/inbound` | — | `{agent_id, persona_id, pathway_id}` (the twin ids; null pre-attach). |
| `POST /:agentId/inbound/attach` / `detach` | `{inbound_numbers: string[]}` | Numbers must belong to the org. Attach materializes/updates the twin pathway+persona (compiled from the dev head AT ATTACH TIME) and points the numbers at it; detach only unbinds rows bound to THIS agent's twin. One number → one agent. |
| `GET/PUT /:agentId/identity` | PUT partial: `display_name (≤80), tagline (≤140), support_email, website, address, vcf_delivery_enabled, rcs_enabled, bcid_enabled` | Contact-card branding. `POST …/identity/logo` (multipart, PNG/JPEG ≤2 MB); `GET …/identity/contact-card.vcf`. |
| `GET /:agentId/identity/bcid` · `POST …/bcid/submit` | submit: `{display_name (≤30), call_reason (≤60), category, phone_numbers[], carriers ⊂ [tmobile, verizon], attest, resubmit?}` | Branded caller ID — submits to carrier review via the telecom registry (ORG-EXTERNAL write; get explicit approval). Status: not_submitted→submitted→pending_review→approved/rejected. |
| `POST /:agentId/identity/contact-card/test` | `{to, channel: sms\|imessage\|rcs}` | Rate-limited 5/min; needs a bound number / configured sender. |

## Memory, library, history

| Endpoint | Notes |
|---|---|
| `GET /:agentId/memory/schema` | `{entity_schemas, source: settings\|cached_version\|null}` — resolution: dev head `settings.memorySchema` → inference cache → twin's production copy. |
| `POST /:agentId/memory/schema/infer` | `{snapshot?}` — infers entity schemas from the compiled agent; persists NOTHING (save the result into `settings.memorySchema` yourself). Rate-limited 6/min. |
| `GET /library/scenarios?exclude_agent_id=` | Reusable scenario nodes read live from the org's other agents' dev heads (50 most recent agents); full node payload inline. |
| `GET /library/archived-nodes` · `POST /:agentId/archived-nodes {node}` · `DELETE /library/archived-nodes/:id` | Self-contained node copies (org-wide, cap 200 listed). Archiving never edits the canvas; delete is hard (safe — copies). |
| `GET /:agentId/scenarios/:nodeId/history?path=&branch=&before=` | Per-scenario SNAPSHOTS (client diffs them), keyset-paged 25/page, plus both env pins' copies. `path` = JSON array of container ids for nested flows. |

## Platform migration endpoints (the platform's own converters)

| Endpoint | Body | Notes |
|---|---|---|
| `POST /migrate` | `{pathway:{nodes,edges,name?,globalPrompt?}, name?, create?}` | LLM planner + deterministic materializer. `create:false` (default) = dry run `{plan, snapshot, lint}`; `create:true` = 201 with agent+version. Caps ≤500 nodes/≤2000 edges/≤2 MB. Rate limit 10/hr/org. 422 on lint failure / blocking loss / open question / unsupported custom code. |
| `POST /migrate/stream` | same | SSE progress (`start/read_nodes/iteration/plan_submitted/materializing/done`). |
| `POST /migrate/pathways` | `{pathways:[{pathway_id, version?, mode?}\|{pathway}], name?, create? (default TRUE)}` | Deterministic 1:1 conversion, ≤20 pathways into one agent; `create:false` returns importable scenario nodes. 60/hr/org. |
| `POST /migrate/persona` | `{persona_id, name?, pathway_modes?}` | Deterministic persona → agent shell + scenarios. Always creates. `translate` modes must go to /migrate/translations. |
| `POST /migrate/translations` → `GET /migrate/translations/:runId` → `POST …/:runId/cancellations` | pathways-body or persona-body | ASYNC (202 + poll). ≤5 translate items, ≤3 active runs/org. Statuses PENDING/RUNNING/FINALIZING/COMPLETE/FAILED/CANCELLED; cancel only pre-FINALIZING. |

## Agent-testing surface (`/v1/agent-testing`)

Scenario CRUD (`/scenarios`, supports `?agent_id=`) · per-scenario eval agents (`/scenarios/:id/eval-agents`) · templates (`/templates`, `/templates/:id/clone`) · `POST /scenarios/generate-from-call` · execution (`/scenarios/:id/run`, `/scenarios/:id/simulate`, `/batch-run`) · results (`/runs`, `/runs/:id`, `/batches/:id`, `/runs/:id/analyze`) · simulation sets (`/simulation-sets`, `/simulation-sets/:id`, `/scenarios/:id/simulation-runs`, `/simulation-runs/:id/results`) · analytics (`/analytics/:pathwayId[/enhanced]`) · tornado load-test mode (`/tornado/*`). Grading discipline and safety rails: the `v2-testing` skill.
