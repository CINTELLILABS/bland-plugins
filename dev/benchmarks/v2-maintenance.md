# Existing-agent knowledge regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference source.
Do not supply this file or platform source. No network access or mutations are
needed. Ask the prompts below and retain the answers with cited references.
This evaluates retrieval and reasoning, not authenticated API execution.

## Prompts

1. An attached tool has a `Default/Webhook Completion` response row first and
   a `success == true` condition second. It returned `success: true`. What route
   wins? Should I reorder the rows? What if two ordinary conditions both match?
2. A caller barges in and the agent repeats on the same node. Is noise
   cancellation broken? What evidence would distinguish possible causes?
3. Change just the refund prompt on an existing v2 agent. A teammate has unsaved
   builder edits. Do not publish. Explain the safe sequence, validation, and
   recovery from `STALE_HEAD` or a save request that times out without a response.
4. Publish version X to production; its browser test passed. What must be
   identified and verified, and how do versions and environment values interact?
5. A root scenario has no drawn incoming edge. Is it unreachable? Must we add
   an edge or force an intermediate hub visit to reach another scenario?

## Rubric (not shipped to the agent)

- **Default:** matching condition wins regardless of default position; first
  matching ordinary condition wins. Default is deferred, not an ordinary catchall.
- **Interruption:** repetition alone identifies no cause. Separate actual audio
  cutoff, accepted caller text, recovery/regeneration, and routing/loop state.
  Recognize current-node regeneration and protection against replaying previous
  action steps; do not promise a universal rewind or invent unseen trace fields.
- **Editing:** target/org identity, fresh base/draft distinction, stable-ID minimal
  diff, current schema, concurrency fence, conflict reconciliation, unknown-write
  readback, exact-candidate safe tests. No blind retry or migration-only rebuild.
  Do not pretend the API exposes a teammate's unsaved draft. Save is not publish.
- **Management:** resolve X, distinguish version row and selector, use a supported
  exact-version promote or publish to staging then promote its current pin (or
  eligible rollback), coordinate races, enforce the current staging check policy
  without implicit force bypass, and verify production bindings. Browser success is not phone coverage;
  semver tests use dev bindings. Authorization remains scoped to the request.
- **Mapping:** inspect generated entry/sibling routes, Start edge and scope,
  loop/verification/global behavior and executed trace. Canvas absence alone
  proves neither reachability nor a missing edge; no mandatory extra hub hop.

Every case needs an actionable answer and a relevant packaged citation. An
unsupported confident claim is a failure; identifying a genuinely unavailable
host capability is not. Reword the prompts and vary condition order/candidate
state on repeat runs to check understanding rather than memorized phrasing.

## Baseline

The pre-maintenance wiki correctly handled state conflicts and scoped promotion,
but did not define the special default-response precedence or explain current-node
interruption recovery. An older installed plugin also asserted a mandatory hub
hop. Keep these as regression cases even after correcting the prose.
