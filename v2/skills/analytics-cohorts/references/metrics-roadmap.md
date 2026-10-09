# Customer metrics: the routes that are coming

Customer metrics are saved definitions whose numbers appear next to the seven
system tiles on the Analytics page. **None of the routes on this page is live
yet.** They land in three steps of the API stack:

| Stack head | What a client can use after it lands |
| -- | -- |
| I-D | The metric routes: list, create, edit, delete, and backfill. |
| I-S | `metrics[]` and `hours[].metrics` on the `/summary` routes with `shape=v2`. |
| I-C | `metric_hour_stats` as a table `query_analytics` can read. |

This page exists so that a metric request before then gets an honest answer,
not an improvised route. Everything marked **unverified, confirm at I-D** (or
at the head named) is a planned contract, not a tested one.

## Check before you answer

Read `bland_api_get` on `/v2/analytics/org/metrics`.

- **404:** the I-D head is not there. Metrics cannot be saved yet. Say so. Do
  not improvise another route, and do not save a dashboard panel and call it
  a metric. Offer what works today:
  - a [cohort](contract.md) that counts the calls matching the condition now;
  - a `query_analytics` read for a one-off rate or average.
- **200:** the routes exist. Use the contract below and re-check any field
  marked unverified against the live response before you rely on it.

Do not read `/summary` for `metrics[]` until the I-S head is there. Do not
query `metric_hour_stats` until the I-C head is there.

## The definition

A query metric's `spec.where` is the same `where` grammar a cohort uses
([grammar](grammar.md)). Validate it offline the same way, and expect the same
refusal messages.

```json
{
  "label": "Long contained calls",
  "description": "Contained calls that ran 5 minutes or longer",
  "kind": "rate",
  "source": "query",
  "denominator": "connected",
  "spec": {
    "where": {
      "and": [
        { "col": "outcome", "op": "=", "value": "contained" },
        { "col": "call_length", "op": ">=", "value": 5 }
      ]
    }
  }
}
```

- `kind`: `rate`, `mean` or `count`. (`median` exists only on the system
  `timeToTransfer` tile.)
- `source`: `query` or `judgment`.
- `denominator`: `connected` (the default) or `total`. No other denominator
  is allowed.
- Query `spec`: `{ where, value? }`. `value` is `{ "col": "<column>" }`. It is
  required for `mean` and refused for `rate` and `count`. `value.col` must be
  a numeric, usable `calls` column: `id`, `call_length`, `max_duration`,
  `price` or `version_number`.
- Judgment `spec`: `{ disposition_id, value_key, numerator: [bucket, ...] }`,
  for a rate or count over a disposition value.

```json
{
  "label": "Booked appointment",
  "kind": "rate",
  "source": "judgment",
  "denominator": "connected",
  "spec": { "disposition_id": "<disposition id>", "value_key": "booked", "numerator": ["true"] }
}
```

A judgment metric can be created and published before its numbers exist. It
reads `status: "awaiting"` with `null` values until disposition results reach
the analytics lake. Treat that as normal and say so.

## Routes (from I-D)

Mounted under `/v2/analytics`. `scope` and `agent_key` come from the path,
never from the body. The envelope `{ data, errors }` is **unverified, confirm
at I-D**.

| Method | Path | Success |
| -- | -- | -- |
| GET | `/v2/analytics/agents/:agentKey/metrics` | 200 |
| GET | `/v2/analytics/org/metrics` | 200 |
| POST | `/v2/analytics/agents/:agentKey/metrics` | 201 |
| POST | `/v2/analytics/org/metrics` | 201 |
| PUT | `/v2/analytics/agents/:agentKey/metrics/:id` | 200 (unverified, confirm at I-D) |
| PUT | `/v2/analytics/org/metrics/:id` | 200 (unverified, confirm at I-D) |
| DELETE | `…/metrics/:id` | 204, no body |
| POST | `…/metrics/:id/backfill` | 202 |
| GET | `…/metrics/:id/backfill` | 200 |

`:id` is a customer row's uuid or a system id (`conversations`,
`containment`, `abandonment`, `escalation`, `timeToTransfer`, `earlyExit`,
`talkTime`). A write to a system id creates an override for that tile.

- Org-scoped metrics are query-only. A judgment metric posted to
  `/org/metrics` is refused.
- GET lists the seven system entries (overrides merged in place), then the
  customer rows. The exact `data` nesting is **unverified, confirm at I-D**.

## Create answers

| Status | Code | Meaning |
| -- | -- | -- |
| 201 | | Created. The body carries the row, `preview`, `backfill`, `default_days` and `max_days`. Nesting **unverified, confirm at I-D**. |
| 409 | `METRIC_CAP` | The scope already has 10 published definitions. An override counts. |
| 422 | `INVALID_METRIC` | A rule failed. The body carries `violations[]`; the item shape is **unverified, confirm at I-D** (expect `{ path, message }`). |
| 422 | `JUDGMENT_IS_AGENT_SCOPED` | A judgment metric was posted to `/org/metrics`. |
| 422 | `PROBE_TOO_EXPENSIVE` | A one-day trial run of the predicate scanned more than the ceiling. Drop heavy tables. |
| 429 | `ORG_BYTE_BUDGET` | The organisation used its daily scan budget for metric queries. It resets at the UTC day change. |

Common answers on every write, all codes **unverified, confirm at I-D**: 400
for a shape error, 403 for a non-enterprise organisation, 403 for a role
refusal on judgment writes, 404 for a foreign agent or id, 413 for a body over
64 KiB, 429 after 30 writes in 60 seconds per caller.

`preview` on create:

- A light query metric returns `{ num, den, window_days: 14 }` over 14 days.
- A heavy query metric returns `preview: null` and `status: "awaiting"`. Its
  numbers come once a day, for completed UTC days.
- A judgment metric has no preview. Its `backfill` carries a cost estimate.

## Edit and delete

- `PUT` replaces the editable fields with the same body as `POST`.
- A label or description change keeps the key and recomputes nothing.
- A change to `kind`, `source`, `denominator` or `spec` supersedes the old
  row, inserts a new one with a new key, and plans a new 90-day backfill.
  Whether the uuid stays the same is **unverified, confirm at I-D**.
- `DELETE` supersedes a customer row, or removes a system tile's override so
  the system tile serves again. DELETE on a system id with no override is
  **unverified, confirm at I-D**.

## Backfill

- Creating a metric or changing its spec plans 90 days by itself.
- `POST …/backfill { "days": n }` asks for more, up to 400. A `days` below 1
  or above `max_days` is a 422 naming `days`.
- Requests are idempotent: only days not already done, running or pending are
  planned. A failed range is planned again on the next request.
- Range `state` is `pending`, `running`, `done` or `failed`. The `next` cursor
  is **unverified, confirm at I-B**.

## Reading the numbers (from I-S)

`GET /v2/analytics/agents/:agentKey/summary?shape=v2` and
`GET /v2/analytics/org/summary?shape=v2` gain `metrics[]`:

- The seven system entries first, in tile order, then customer rows by
  creation time. An override replaces its tile in place.
- Render by the entry's `kind`, not its id: `count`, `rate` and `mean` carry
  `{ num, den }`; `median` carries `{ value }`.
- A value is `null`, never `0`, while the metric is `awaiting`, when the
  denominator is zero, or when no row exists for the window.
- `status` is `ready` only when coverage spans the whole window. Otherwise it
  is `awaiting` and `coverage.days_covered` shows progress.
- A summary that omits customer entries is a failed read, not a deletion.
- `as_of`, a mean's hourly denominator, and whether system entries appear in
  `hours[].metrics` are **unverified, confirm at I-S**.

## Querying by hand (from I-C)

`metric_hour_stats` becomes readable through `query_analytics`. A query on it
must filter on `key` (equality or `in`); the error code for a missing filter
is **unverified, confirm at I-C**. Each definition's `key` comes from
`GET …/metrics`.

- Rate or count: `sum(n_calls)` where `key` matches and `value_bucket` is a
  numerator bucket (`'true'` for a query metric), over the hour rows'
  `connected` or `total`.
- Mean: `sum(num_sum) / sum(num_count)` where `key` matches.

## Access

- Every metric route needs an enterprise organisation and is scoped to the
  caller's organisation.
- Judgment create, judgment spec edits and judgment backfills need the
  session role admin, owner, operator or prompter. Organisation API keys are
  admitted. Whether a label-only judgment edit passes this gate is
  **unverified, confirm at I-D**.
- Query-metric writes carry only the per-caller write limit.
- Keep heavy tables few in one definition. Several heavy tables together can
  exceed the trial-run ceiling.
- The limits above (scan budget, trial-run ceiling, write rate) are starting
  values and can change before release.

## Page actions

The Analytics page will expose actions Norm calls after the API answers, such
as recomputing a metric tile. Their arguments are **unverified, confirm at
I-D**. Do not call a page action for a metric until the routes above answer.
