# Retrieve a reproducible call cohort

## API surfaces

- `GET /v1/calls`: list/search calls. Existing documented controls include
  `start_date`, `end_date`, `timezone`, `completed`, `answered_by`, `inbound`,
  `batch_id`, number filters, `from`, `to`, `limit`, `sort_by`, and `ascending`.
  Confirm current supported fields in official docs before constructing a query.
- `GET /v1/calls/{call_id}`: full detail, including available transcript,
  variables, request data, and pathway evidence. A list row is not a full trace.
- `get_call_log`, when advertised, is a convenient curated first read; use the
  generic API for fields the curated schema omits.
- Use the authorized recording reference or documented recording endpoint when
  audio is needed; availability depends on recording and access settings.

For the generic read MCP, query values are strings. Example page:

```json
{
  "path":"/v1/calls",
  "query":{
    "start_date":"2026-01-01T00:00:00Z",
    "end_date":"2026-01-08T00:00:00Z",
    "from":"0",
    "limit":"100",
    "ascending":"false"
  }
}
```

The dates above are synthetic examples, not the user's requested window.
List responses expose `calls` and `total_count`; inspect the actual envelope.
The current offset contract uses `from` as a zero-based offset and `to` as an
exclusive bound; `limit` caps the page at 1000. Prefer a smaller page for rich
records, and do not combine offset paging with an invented cursor field.

## “Most recent 1,000” procedure

1. Capture an absolute UTC cutoff before fetching. Specify a lower bound where
   useful, and retain the exact filter set and sort request in a manifest.
2. Fetch modest pages through the API and save each complete response. Increase
   the offset by the **raw returned count**, not the number of new unique IDs.
3. Deduplicate by stable call ID; detect repeated pages/no progress. Stop at
   exhaustion, the bounded candidate limit, cancellation, or a recorded error.
4. Verify returned timestamps/order. Do not assume the displayed order or a
   `sort_by` label proves exact creation-time ranking. If needed, retrieve the
   bounded candidate window and sort locally by creation time with an ID tie
   breaker before selecting 1,000.
5. Offset lists are not transaction snapshots. New/deleted/updated records can
   move while paging. Use the cutoff, reconcile duplicates and gaps, and report
   the coverage limit if exact top-N cannot be established from the API.
6. Save the selected IDs as the cohort. Fetch full details only where required,
   with bounded concurrency and rate-limit backoff. Preserve a failure ledger.
7. On resume, reuse the cohort IDs and successful files; retry only known failed
   reads. Do not silently replace missing records with different calls.

A short page/empty result is useful evidence only when the response is valid
and complete. A 403, timeout, truncated payload, or unsupported filter does not
mean there are no calls. `total_count` alone does not establish complete coverage.

## Evidence and output layout

Suggested task-local layout (not a special API or required platform directory):

- `manifest.json`: filters, cutoff, retrieval time, requested/fetched/unique/
  selected counts, API operation description, and known coverage limitations.
- `pages/`: raw authorized pages; retain locally, not in public reports.
- `calls/`: detail records only for selected IDs requiring them.
- `failures.jsonl`: call ID, safe error category, attempt count; no credentials.
- `cohort.json`: stable selected IDs, target agent/version when known.

Minimize personal information and retention. Never commit fetched customer
data or copy signed recording URLs into public/shared reports.
