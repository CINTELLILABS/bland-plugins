# An agent's voice and language

How to choose, set and verify the voice and spoken language of a v2 agent.
The fields live in the version snapshot, so a change ships through the normal
[pipeline](lifecycle.md#the-ship-pipeline). Field semantics are in the
[field guide](../../v2-snapshot/references/knobs.md).

Do not write fetch scripts and do not search the docs for these routes.

## Contents

- [Fields](#fields)
- [Workflow: set the voice and language](#workflow-set-the-voice-and-language)
- [Discovery routes](#discovery-routes)
- [Dashboard only](#dashboard-only)
- [Rails](#rails)

## Fields

| Field | Rule |
|---|---|
| `settings.voice` | A voice id (UUID). `""` means the platform default. The validator does not check it: a deleted, inaccessible or draft voice saves cleanly, then fails outbound calls and plays the default voice on inbound. |
| `settings.voicePool` | Optional rotation: 2 to 20 distinct ids, one picked at random per call. Keep `voice` equal to `voicePool[0]`. Unusable entries are skipped. Fewer than two ids means `voice` is used. |
| `settings.languages` | Keys from `GET /v1/languages`: a language code (`en`, `en-GB`, `es`) or a multilingual mode (`fluent`, `babel`, `auto`). Put the target language first: **only `languages[0]` reaches calls**. Older friendly ids such as `english` are still read; write the canonical key. |

There is no per-step voice, per-language voice, or agent-level speed or
stability. Synthesis settings belong to the voice and change every agent that
uses it. Always store the id, never a voice name.

## Workflow: set the voice and language

Call budget: one snapshot read, one or two discovery reads, one verify read per
chosen id, one models read, one version save, one read-back.

1. Read `GET /v2/agents/:agentId/versions/latest` and note
   `settings.voice`, `settings.voicePool` and `settings.languages`. During any
   unrelated edit, keep them as they are.
2. Find candidates. Start with the `list_voices` tool: curated voices on the
   current recommended generation, English only. For other languages or the
   org's own voices use `GET /v1/voices` (what the builder's picker lists) or
   `GET /v1/voices/shared` with `search`, `service`, `tag` or `gender`.
3. Check the language. `GET /v1/models` lists each voice model's `service`
   and `languages`. A voice can speak only the languages its model lists. For
   a non-English target, pick a voice whose model lists that language.
4. Verify each chosen id with `GET /v1/voices/:id`. It must return `{voice}`
   (400 `VOICE_NOT_FOUND` means this org cannot use it). If `is_live` is
   `false` it is a draft trained voice: stop, say it would fail calls and that
   making it live spends a professional clone slot, and hand off to the
   [dashboard](#dashboard-only).
5. Write `settings.voice`, the optional `settings.voicePool` (with
   `voice === voicePool[0]`) and `settings.languages` (target first) into the
   snapshot from step 1. Save with `POST /v2/agents/:agentId/versions`
   (`{snapshot, name, parent_version_id, parent_revision}`).
6. Read the version back and confirm the three fields. Say which callers hear
   it: test chat runs the dev head now; outbound and inbound calls run the
   production pin, so they change only after publish and promote. Offer the
   [pipeline](lifecycle.md#the-ship-pipeline); do not promote unasked.

## Discovery routes

All reads, all reachable over an OAuth connection.

| Route | Returns | Notes |
|---|---|---|
| `list_voices` (tool) | curated voices with `id`, `name`, `description`, `tags`, `service` | English, current generation. Match the user's brief against description and tags. |
| `GET /v1/voices` | `{voices}` at the root (no `data` envelope) | Catalog plus the org's own and saved voices. |
| `GET /v1/voices/shared` | public catalog page | Query: `search`, `sort`, `service`, `tag`, `gender`, `page`, `page_size`. An unknown `service` returns 400 `INVALID_SERVICE`. |
| `GET /v1/voices/library` | the org's own and saved voices | |
| `GET /v1/voices/:id` | `{voice}` with `service`, `finetuned`, `is_live`, `tags` | 400 `VOICE_NOT_FOUND` when not accessible. |
| `GET /v1/models` | `{models}`: `service`, `languages`, `is_recommended` | Use for language support per voice model. |
| `GET /v1/languages` | `{languages: [{language, name}]}` | Valid keys for `settings.languages`. |

## Dashboard only

The API connection carries JSON only. Audio responses and file uploads cannot
pass through it. Name the dashboard path instead.

| The user wants to | Dashboard path |
|---|---|
| Hear a voice before choosing | `/dashboard/voices`, the play button on a voice |
| Clone a voice from a recording | `/dashboard/voices`, Create voice |
| Train a professional voice, or make a draft voice live | `/dashboard/voices`, the training pages |
| Generate speech in the studio | `/dashboard/tts` |
| Buy a speech plan or credits | `/dashboard/tts/settings` |

## Rails

- Never call synthesis routes (`/v2/tts`, `/v1/speak` and its variants,
  `/v1/voices/:id/sample`, `/v2/audio/speech`). They return audio the
  connection cannot carry, and some bill before the error comes back.
- Never accept terms or attest consent for the user (`tos_accepted`), and never
  subscribe, pay, mint stream tokens, create share links, publish a voice to
  the community, or duplicate a voice into another org.
- Before `DELETE /v1/voices/:id`, a voice settings write
  (`POST /v1/voices/:id/settings`) or demoting a trained voice: list the org's
  agents whose dev head or production version uses the id in `voice` or
  `voicePool` (`GET /v2/agents`, then each agent's versions), name them, and
  get explicit confirmation. These change every agent and number that uses the
  voice. Deletion cannot be undone.
