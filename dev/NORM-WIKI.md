# Maintaining the Norm product wiki

## Problem and boundary

The v2 plugin's authoring/migration instructions did not cover evaluation
workflows, large-call analysis, or the evidence needed for voice assertions.
Copying an entire manual into the prompt would obscure the task and create
another source of drift. Keep short task entrypoints and linked local references
inside `v2/skills/`; the existing MCP remains the API execution surface.

This follows the [skill progressive-disclosure pattern](https://learn.chatgpt.com/docs/build-skills)
and [plugin packaging guidance](https://developers.openai.com/plugins/build/plugins).
Keep the existing compatible `.codex-plugin/plugin.json` layout rather than
migrating host configuration as part of a knowledge-only update.

## Source and scope review

- Validate endpoint facts against current product API contracts and
  [official Bland documentation](https://docs.bland.ai). Older plugin prose can
  drift; do not use it as the sole authority for a new request example.
- Document observable product behavior, not proprietary implementation code.
  Never copy private repository files into this public repository.
- New references must not include internal provider/model names, infrastructure
  addresses, credentials, customer records, or captured live responses.
- Keep synthetic examples clearly labeled. Distinguish an example report schema
  from an actual API request; distinguish capabilities from recommendations.
- Reuse the existing snapshot/runtime/lifecycle references rather than fork a
  second field dictionary. An unfamiliar option requires live docs discovery.
- Preserve authentication, command allowlists, approval rules, and host bindings.
  Documentation is not an authorization change.

## Local checks

Run from the repository root:

```sh
node --test dev/scripts/test-norm-wiki.mjs
node --test dev/scripts/test-norm-materialize.mjs
git diff --check
```

The checks cover skill discovery metadata, local references staying in the
archive, reference reachability, JSON examples, and aligned release versions.
They are not an API integration or audio test. Also use the Codex plugin
validator when available; no installation or credential changes are required.

The materializer's consumer test requires a consuming SERVER checkout. From its
API directory, set `NORM_V2_COMPILER_PATH` to the absolute `toPathway.ts` path and
run `pnpm exec tsx --test` with this plugin's absolute
`dev/scripts/test-norm-materialize.mjs` path. It feeds generated snapshots through
the real save validator, compiler and transfer-field guard. Without that explicit
path the consumer test is reported skipped, not passed. It makes no API calls.

Review changed files for sensitive content and scope before publishing. No
keyword scan is proof of confidentiality; read the diff. Bump all four v2 host
manifests together when preparing a release, per `dev/RELEASING.md`.

## Behavioral retrieval checks

For existing-agent edits and behavioral diagnosis, also run the
[maintenance regression cases](benchmarks/v2-maintenance.md). Keep their grading
rubric outside the shipped `v2/` archive. The heading check supports plain
Markdown headings, not raw HTML; unsupported headings fail explicitly.

The [v2 surface cases](benchmarks/v2-surface.md) cover execution, transfer field
dialects, knowledge/memory activation, auth/channel nodes, current promotion
policy, historical graphs, variable rows, dispositions and API discovery.
Keep the coverage map current by checking the supported node-type registry and
agent API families when preparing a release. Do not claim a whole surface is
verified merely because its name appears in the index.

Test an agent with only `v2/` as its reference source, without server code or
network calls. Do not preload the entire wiki into its prompt. Ask:

1. Create a transcript judge, attach a test scenario, run it, and explain how to
   distinguish execution failure from a failed verdict. Cite routes and fields.
2. Analyze 1,000 recent calls reproducibly without loading all transcripts into
   chat. Explain pagination, incomplete retrieval, and output reconciliation.
3. Given a transcript and an empty audio queue, can you prove audible interruption?
4. Does editing local JSON update the saved agent or the user's unsaved page?
5. A scenario or global step has no visible incoming arrow: is an edge missing?
   Explain implicit entry/sibling/return routes, actual Start-edge entry, and
   why an isolated cycle with incoming edges can still be unreachable.
6. A caller cuts in but stays on the same node; an old step audio setting has no
   visible effect. Distinguish audio cutoff, topic routing, globals, and active
   call-level settings. Do not claim all scenario changes require a hub detour.

Before this change, the v2-only reference baseline could not answer the first
three fully; it knew save and publish differed but lacked page/workspace
reconciliation guidance. A post-change pass must cite the references, preserve
uncertainty, and avoid inventing endpoints or claiming unperformed tests.

The mapping follow-up baseline repeated the old mandatory-hub-hop explanation
and could not resolve audio-setting scope. The updated references must correct
those answers, not merely add more prose beside the conflicting old statements.

## Managed workspace rollout is separate

Merge/release here first. A managed consumer that pins the source revision and
file inventory must update that pin, verify the complete artifact, and exercise
skill discovery and authenticated tools in its own deployment process. New
reference files do not appear in an already-running pinned workspace merely
because this repository changed. Do not edit a user's installed plugin cache as
a substitute for updating the canonical source and consumer pin.
