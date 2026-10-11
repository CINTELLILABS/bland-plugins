# Writing a Norm skill

How a skill in `v2/skills/` is built so that it triggers and works in Claude
Code and in Codex alike. The worked examples are
[analytics-authoring](../v2/skills/analytics-authoring/SKILL.md) and
[analytics-cohorts](../v2/skills/analytics-cohorts/SKILL.md).

## The problem

A skill fails in three quiet ways:

- **It never loads.** The host did not match the user's words to it.
- **It loads but the agent improvises.** It writes fetch scripts, searches
  docs for routes the skill should have stated, or guesses a field name.
- **It loads and is wrong.** It drifted from the server, or it promises a
  feature that is not live.

Each rule below exists to stop one of these.

## How a host finds a skill

```text
  user words ──► host reads every SKILL.md frontmatter (name + description)
                      │
                      ├─ match ──► loads SKILL.md body ──► body links references/
                      │
                      └─ no match ──► skill is invisible
```

- The frontmatter `name` and `description` are the only trigger surface. The
  host reads nothing else before it decides. Codex finds skills through
  `"skills": "./skills/"` in `v2/.codex-plugin/plugin.json`; Claude Code reads
  the same folders.
- `name` matches the folder name: `v2/skills/analytics-cohorts/` has
  `name: analytics-cohorts`.
- Commands (`v2/commands/*.md`) exist only on hosts that run slash commands.
  The Codex manifest declares none. A skill must work when no command ran.

## The description

Start with "Use when", then list concrete triggers in the user's words.

```text
description: Use when building a list or cohort of conversations that match
a condition ("show me the calls where…", "which calls…", "how many calls…"),
counting calls by lake columns, filtering by outcome, …, or explaining why a
condition cannot be expressed. Covers …
```

- Quote the phrases users type. "Show me the calls where" matches; "cohort
  materialisation" does not.
- Name the objects and pages: "the analytics Sankey", "the Conversations page".
- Include the refusal case ("explaining why … cannot be expressed"). Users ask
  for the impossible, and the skill should load to say no well.
- Keep it on one line. The wiki test matches `description: .+` on one line.
- Two skills must not claim the same trigger. The Sankey skill owns chart
  shape; the cohort skill owns "which calls". Each body names the other as
  the hand-off.

## Progressive disclosure

```text
  SKILL.md (≤ ~650 words)          references/ (depth, read on demand)
  ├─ what the object is            ├─ grammar.md    rules + refusal table
  ├─ when to use it vs neighbours  ├─ contract.md   routes, bodies, statuses
  ├─ numbered workflow             ├─ semantics.md  what results mean
  ├─ refusal loop                  ├─ examples.md   worked prompts
  ├─ limits                        ├─ tables.md     generated column list
  └─ what it cannot express        └─ metrics-roadmap.md  not-yet-live routes
```

- `SKILL.md` stays under about 650 words. The wiki test enforces this for the
  skills it lists. Count with `wc -w`.
- `SKILL.md` links each reference at the step that needs it ("read the
  contract before the first request"), not in a list at the end.
- Every reference is reachable by links from `SKILL.md`, and the skill is
  reachable from the [wiki index](../v2/skills/api-workspace/references/index.md).
  The wiki test walks those links and fails on a missing file or anchor.
- Plain Markdown only. No HTML; the anchor checker refuses HTML headings. No
  em-dashes. Short sentences.

## The workflow section

Write it as numbered steps with the exact tool and route at each step.

- Name the first-party tools: `bland_api_get` for reads, `call_bland_api`
  with `method`, `path` and `body` for writes.
- Put the contract in the skill, then say so: "Do not write fetch scripts and
  do not search the docs for these routes." Without that line, agents reach
  for docs search and find older routes.
- State the call budget of a complete turn. analytics-authoring says "one
  read, one PUT, one POST"; analytics-cohorts says one validate, one POST, the
  polls and a report. The benchmark grades against the same budget.
- Say what the page does by itself. Both analytics skills tell the agent the
  page refreshes or opens the list itself, so it never asks the user to reload.
- Split questions from changes. A question is answered from reads alone.

## Offline validators

When the API refuses bad input with named rules, ship a script that applies
the same rules first, so most refusal loops never reach the API.

| | analytics-authoring | analytics-cohorts |
| -- | -- | -- |
| Script | `scripts/validate-definition.cjs` | `scripts/validate-predicate.cjs` |
| Input | a definition and the members read | a request, a predicate, or a bare `where` |
| Output | `violations: [{ rule, id, message }]` | `violations: [{ path, message }]`, `cost_class` |
| Test | `tests/analytics-authoring.test.cjs` | `tests/analytics-cohorts.test.cjs` |

Rules for a validator:

- **Mirror the server message for message.** Same rule ids or paths, same
  message text, so the refusal table in the reference serves both.
- **List every violation**, not only the first.
- **Fail closed.** An unresolved column counts as heavy; an unreadable input
  exits non-zero.
- **Say what it does not check.** The cohort validator checks only `where`;
  the API checks the window and the other keys.
- **Generate data, do not hand-copy it.** The cohort allowlist lives in
  `scripts/trusted-layer.json`; `scripts/render-tables.cjs` renders
  `references/tables.md` from it, and the test fails when the two disagree.
- **Parity tests.** Each refusal in the reference has a test that produces it.
  Re-check against the server whenever its rules change; the API stays the
  authority when it moves ahead of the packaged copy.
- Plain Node, no dependencies, CommonJS (`.cjs`), so it runs on every host.

## Examples

- Synthetic only. Placeholders in angle brackets (`<agent id>`), invented
  numbers labelled as synthetic.
- Every `json` fence parses as strict JSON. No comments, no trailing commas.
  Use a `text` fence for annotated shapes.
- Run every example predicate or definition through the validator before you
  ship it.
- Include the refusal path and the impossible ask, each with the exact
  message and the hand-off. End with an anti-pattern list.

## Contracts that are not live yet

Put them in their own reference, as `metrics-roadmap.md` does:

- Name the stack step each route lands in.
- Give the agent a probe ("if `GET /v2/analytics/org/metrics` answers 404, the
  routes are not there") and the honest answer for that case.
- Keep every "unverified, confirm at …" tag from the source. Never promote a
  plan to a fact in a public reference.

## What never enters this repository

This repository is public. Never commit:

- private platform source, copied or paraphrased line by line;
- internal provider or model names, infrastructure addresses, workgroup,
  bucket, database, queue or region names, environment variable names;
- credentials, keys, tokens, or anything shaped like one;
- customer records, real ids, captured live responses;
- people's names, internal ticket ids or internal PR links.

API paths, table names and column names are public contract and may appear.
Read the diff before publishing; no keyword scan proves confidentiality.

## Registering a skill

- A task row in the [wiki index](../v2/skills/api-workspace/references/index.md).
- A surface row in the [surface map](../v2/skills/api-workspace/references/surface-map.md).
- A bullet under "Skills" in [the v2 README](../v2/README.md), and a commands
  row if a command was added or its description changed.
- A command only if users will type one. Keep it thin: resolve page context,
  load the skill, restate the workflow in a few steps. `v2/commands/analytics.md`
  routes to the Sankey or the cohort skill and adds no rules of its own.
- A benchmark at `dev/benchmarks/<skill>.md`: prompts plus a rubric. It lives
  outside `v2/` so the rubric never ships to the agent.

## Tests to run

From the repository root:

```sh
node --test dev/scripts/test-norm-wiki.mjs
node --test tests/analytics-authoring.test.cjs
node --test tests/analytics-cohorts.test.cjs
git diff --check
```

The wiki test checks frontmatter shape, link and anchor reachability, JSON
fences in the wiki pages, and that the four host manifests carry one version.
Then run the skill's benchmark by hand with a fresh agent that sees only
`v2/` ([NORM-WIKI](NORM-WIKI.md)).

## Releasing

- Add a `CHANGELOG.md` entry.
- Bump `"version"` in all four manifests together:
  `v2/.claude-plugin/plugin.json`, `v2/.codex-plugin/plugin.json`,
  `v2/.cursor-plugin/plugin.json`, `v2/.grok-plugin/plugin.json`. Hosts ignore
  an update without a version bump. See [RELEASING](RELEASING.md).
- **A merge is not a deploy.** The managed runtime pins this plugin by
  revision. A new skill reaches it only when that pin is updated and the
  packaged artifact is tested there. Until then, a live Norm does not have it.

## Checklist

- [ ] Folder name equals `name`; description starts "Use when" and quotes triggers.
- [ ] `SKILL.md` under about 650 words; every reference linked at its step.
- [ ] Workflow names the tools, the routes and the call budget; forbids fetch scripts and docs search.
- [ ] Neighbouring skills named as hand-offs; "cannot express" list present.
- [ ] Validator mirrors server messages; tests cover each refusal.
- [ ] Examples synthetic, validated, strict JSON.
- [ ] Not-yet-live routes isolated and tagged unverified.
- [ ] Index, surface map, README, benchmark, CHANGELOG, four manifests.
- [ ] Diff read for private content.
