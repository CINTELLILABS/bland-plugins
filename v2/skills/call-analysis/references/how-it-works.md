# What evidence a conversation leaves, and where

This page explains which records exist for one call or thread, when each one
appears, and which read answers which question. Route details and paging are
in [retrieval](retrieval.md) and [conversations](conversations.md); the
analysis method is in [analysis](analysis.md).

## What it is

Every conversation leaves an evidence trail: the call record, what was said,
what the agent did in between, what was produced after it ended, and what the
platform measured. Reading the right part of that trail is how you answer
"what happened on this call" without guessing from a summary.

It is not:

- **A platform evaluation.** A judge run or disposition scores calls on the
  platform ([evaluations](../../evaluations/SKILL.md)). Your own
  categorisation in a workspace is not that, and must not be presented as it.
- **Analytics.** Counts and rates across calls come from the Analytics page
  ([cohorts and tiles](../../analytics-cohorts/references/how-it-works.md)).
- **One id space.** A voice call, a messaging thread and a web chat thread
  each have their own id and their own routes.

## Objects and how they relate

```text
 voice call (call id)                              messaging thread (conversation id)
 │                                                 │  SMS, iMessage, WhatsApp, RCS, API chat
 ├─ call record      status, length, from/to,      ├─ messages (with summary, disposition_tag)
 │                   ended by, transfer, error,    └─ per-turn trace for agent replies
 │                   price, version, external id
 ├─ transcript       flat transcript lines          web chat thread (thread id)
 ├─ event timeline   node transitions, tool and     └─ messages, newest page first
 │                   webhook calls, knowledge
 │                   lookups, variable changes,
 │                   interruptions, keypad presses
 ├─ recording        audio, when recording was on
 ├─ after the call   summary, analysis, variables,
 │                   citations, disposition results
 ├─ measurements     call scores
 └─ side records     tool logs, knowledge retrievals, memory changes,
                     SIP ladder, notes, triage flags
```

- Everything is org-scoped. A call id from another organisation reads as not
  found.
- A call is tied to the agent and agent version that ran it
  (`agent_id`, `agent_version_id`). Analyse each call against that version,
  not the current one.
- A warm transfer creates a second call (`is_proxy_agent_call: true`) for the
  leg to the human. Its evidence is separate.

## Lifecycle and states

```text
 created ──► queued ──► started (live) ──► ended ──► after-call outputs written ──► (retention) audio/text removed
   │            │            │                │
   └─ error ────┴────────────┘                └─ never connected: no transcript, no recording
```

| State | What exists | Where to look |
| -- | -- | -- |
| Queued or live | The call record | Conversations page Active tab; the call record shows it is not completed |
| Ended | Record, transcript, event timeline, recording (if on) | Conversations list; the call detail read |
| After the call | Summary, analysis, extracted variables, citations, disposition results, call scores | The call detail read; the detail panel rail |
| After retention | The record stays; recordings and transcripts older than the organisation's retention policy (14 days at the shortest) are removed | Organisation settings show the policy |
| Errored or not connected | The record with `queue_status` and `error_message` | The call detail read |

`queue_status` names where an error happened (`pre_queue_error`,
`queue_error`, `call_error`, `complete_error`). `completed: false` means the
call never connected.

## How it reaches a live call or conversation

Evidence is written by the call itself, so the question is when each piece
becomes readable.

| Evidence | Readable when |
| -- | -- |
| Call record | At creation; updated as the call progresses. In-progress calls are on the Active tab. |
| Conversations list row | Once the call completes. The list shows completed calls only. |
| Event timeline | During and after the call; complete once it ends |
| Recording | After the call ends, only when recording was on |
| Summary, analysis, variables | Shortly after the call ends; a minute or more is normal |
| Citations | After the call; the read reports `citations_status` (`ok`, `incomplete`, `unavailable`) |
| Disposition results | After the disposition has run on the call |
| Call scores | After the call is completed and scoring has run |
| Analytics tiles and cohorts | Usually within the hour; the Sankey the next UTC day |

A missing after-call field on a call that ended seconds ago is not missing
data. Wait and read again before you call it a failure.

## On the dashboard

The Conversations page, `/dashboard/conversations` (and the agent-scoped list
under the agent), is where people read calls and threads.

| Part of the page | What it shows | Backing read |
| -- | -- | -- |
| List | Completed calls, texts and chats, filterable; a cohort or a deep link narrows it | `/user/logs`, `/v1/sms/conversations`, `/v1/widget/threads` |
| Active tab | Calls in progress | live |
| Detail: timeline | Transcript turns with routing, tool and webhook events between them, and an audio player with markers | call detail, event timeline, recording |
| Detail rail: Metadata | Call fields and the generated summary | call record |
| Detail rail: Notes | Team notes on the call | call notes |
| Detail rail: Memory | Context the call started with and the memory it changed | memory |
| Detail rail: Variables | Final variables | call detail |
| Detail rail: Dispositions | Each disposition's latest result for the call | disposition results |
| Detail rail: Pathway tags, QC tags | Tags emitted by nodes; quality tags | call record |
| Detail rail: Guardrails & issues | Guardrail triggers on the call | call record |
| Flag | Files the call, a node or a message into an issue | [triage](../../triage-issues/SKILL.md) |

Notes:

- The rail's **Metrics** section can read "No metrics for this conversation"
  even for a scored call. For platform scores, read `/v1/calls/metrics`.
- For agent-driven calls the flat transcript can be empty; the dialogue is in
  the event timeline. The page falls back to it, and so should you.
- The page reads; it does not change the call. Writes from Norm elsewhere do
  not refresh this page; reload it to see new after-call outputs.

## Rules and limits

| Rule | Value |
| -- | -- |
| `/v1/calls` page | `limit` up to 1000, offset paging with `from` and `to`; no agent filter |
| `/user/logs` page | `take` up to 100, cursor paging; `cohort` cannot combine with filters |
| Messaging list page | `limit` up to 1000, offset paging |
| Web chat list page | `limit` up to 100, cursor paging |
| Call detail | accepts the call id or your own `external_id` (newest wins); `fields=` returns a subset; `v=2` returns the event-timeline format in `pathway_logs` |
| Event timeline | `GET /v1/pathway_calls/<call id>?v=2`; sort by `sequence`, not `created_at`; gaps are normal |
| Knowledge chunks | need the list row's `created_at` |
| SIP number history | at most 500 calls |
| Call scores | 400 `CALL_NOT_COMPLETED` for a live call; 404 `METRICS_NOT_FOUND` when none were computed |
| Recording | only when recording was on; a 404 "no recordings found" otherwise |
| Exports | 20 per hour; the file is emailed, not returned |
| OAuth-connected hosts | cannot reach `/user/logs`, `/v1/sms/**`, `/v1/widget/**`, `/exports/**`, `/v2/tools/**`, `/v1/sip/**` |

## When it goes wrong

| Symptom | Likely cause | Evidence | Fix |
| -- | -- | -- | -- |
| Transcript empty on an agent call | Dialogue lives in the event timeline | `transcript.user` / `transcript.assistant` events exist | Read the event timeline. |
| 404 on a call route | A thread id in a call route, or another org's id | The id came from a messaging or chat list | Use the route for that id's kind ([conversations](conversations.md#keep-the-id-spaces-apart)). |
| No recording | Recording off, call never connected, or past retention | `record: false`, `completed: false`, or call older than the policy | Say which; do not report a platform fault. |
| Summary or variables null | After-call processing not finished, or the call never connected | Call ended moments ago; `completed` | Wait and reread. |
| `citations_status: "incomplete"` | Citations were read only partly | The status field | Reread later; do not treat missing citations as "none found". |
| Tool shows "HTTP 0" or "Invalid URL format" | The tool definition failed its check and fell back | No tool log row for that call | Fix the tool definition ([retrieval](retrieval.md#evidence-for-one-call)). |
| Tool log row with `status: "error"` | The service behind the tool failed | `error_type`, `error_message` | Read the message before changing the agent. |
| `METRICS_NOT_FOUND` | No scores computed for this call | 404 | Say so; it does not mean the call is missing. |
| Agent's calls missing from `/v1/calls` | That route has no agent filter | n/a | Use `/user/logs` with the agent filter. |
| Counts disagree with the Analytics page | Freshness, or the list hides non-completed calls | Compare windows and `completed` | Explain which source each number came from. |

## Questions people ask

**Where is the full transcript of an agent call?**
In the event timeline (`/v1/pathway_calls/<call id>?v=2`), as
`transcript.user` and `transcript.assistant` events. The flat transcript can
be empty for these calls.

**Why does the call have no recording?**
Recording was off, the call never connected, or the organisation's retention
policy removed it. The call record says which of the first two.

**How do I know which version of the agent handled a call?**
`agent_version_id` on the call record. Analyse against that version.

**Can I see why the agent routed where it did?**
Yes. Each `node.transition` event lists the routes it could take, the one it
chose and how it decided.

**The summary says the booking succeeded. Can I trust that?**
No. A summary is generated text. Confirm with the tool result in the event
timeline or a disposition that checks it.

**How do I look up a call by my own id?**
Pass your `external_id` in place of the call id on the call detail read.

**Why is a call I just finished not in the Conversations list?**
The list shows completed calls. A call still in progress is on the Active
tab.

**Is a texted conversation a call?**
No. It is a thread with its own id and routes. Never pass its id to a call
route.
