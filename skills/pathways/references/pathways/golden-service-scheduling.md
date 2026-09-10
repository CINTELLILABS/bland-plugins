# Golden reference — full production pathway (service scheduling, middleware variant)

**What it is:** A sanitized copy of a production voice-scheduling pathway for automotive
service, in raw Bland pathway JSON (`golden-service-scheduling.json`, ~200KB). Hosts, keys, and
names are placeholders; the graph, prompts, tool wiring, and design patterns are real and
battle-tested. The JSON is self-annotating: a top-level `_claude_readme` array plus a
`_claude_note` on every node.

**Use it when:** designing a new multi-node pathway, wiring tools/webhooks into nodes, writing
edge conditions, or deciding what belongs in code vs. prompt. Read this guide first; open the
JSON only for the specific node or edge you're emulating (it is large — Grep for the node name
rather than reading the whole file).

## Architecture

```
Load Dealer (Custom Code, start)   — fetches per-dealer config, publishes ~50 call variables
  └─ Greeting / Intent             — routes by intent, answers quick FAQ
       ├─ Identity                 — phone lookup tool + deterministic profile resolver
       │    ├─ Service Resolution  — caller's words → bookable opcodes (resolver snippet)
       │    │    └─ Scheduling     — availability tool + scheduling resolver; the ONLY node
       │    │                        that writes to the booking API
       │    └─ Scheduling (cancel/check-in path)
       ├─ Unsupported Confirmation — one chance to switch back before routing away
       └─ satellites: FAQ (Vector DB KB), Pricing, General Transfer,
                      Service Escalation, 2× Transfer Call
  └─ Wrap Up — honesty machinery (see below) → End Call
```

## The four design principles (from `_claude_readme`, proven in production)

1. **Deterministic code over prompt trust.** Anything the model could get wrong is computed or
   validated in tool code. The resolvers REFUSE rather than comply: a time not in the
   availability grid, a booking with zero services, a transport the caller never chose, a
   cancel without verified identifiers — all return structured refusals carrying
   `agent_instructions` that tell the model exactly what to do next. Every tool response
   carries `agent_instructions`; it is the steering channel.
2. **Honesty gates.** The model may not claim an action happened unless the tool reported
   success — and for bookings, success additionally requires the API returning an appointment
   id. Prompts repeat this at every node that could confabulate: "success is false — NOTHING
   happened." The Wrap Up node re-checks `appointmentId` before any summary claim.
3. **Loop protection.** State ledgers round-trip through call variables (execution counters,
   request signatures, answered-question ledgers) so an identical tool re-call is detected in
   code and short-circuited with escalating instructions — instead of hoping the model stops.
4. **Edge routing is prompt engineering.** Every edge carries a natural-language `description`
   the routing model matches against — including explicit negative space ("This does NOT
   include a recall…"). Every conversational node needs an exit for "caller is done" and
   "caller wants a human"; dead ends are how calls get stuck. Note the mid-flow transfer edges.

## Platform semantics the pathway designs around

- **Global prompt placement:** the last entry in `nodes[]` is a pseudo-node carrying
  `globalConfig.globalPrompt`, prepended to every node. Voice discipline and universal rules go
  there; node prompts stay node-specific.
- **Tool payload asymmetry:** tool snippets receive the FULL call-variable bag as their request
  payload (declared variables are only the model-extracted inputs merged in), but only
  `response_data`-mapped fields write back to call variables.
- **Variables are ambiently visible** to the model at every node — so behavior rules must live
  where questions actually get answered, not only where they logically belong (e.g. hours
  answers read exclusively from a pre-rendered `hours_spoken` variable, enforced at the FAQ
  node).
- **Config-driven multi-tenancy:** the start node is pure code — it loads one dealer's config
  and publishes it as variables, so the same graph serves every dealer with zero prompt edits.

## Edge descriptions worth imitating (verbatim from the JSON)

- Intent split with concrete positives: "Choose this pathway if the reason the caller called in
  was something related to auto service/repair appointments. Look for specific requests like:
  Booking or scheduling a new appointment, Resched…"
- Negative space to prevent misrouting: "Choose this pathway if the user called in about an
  existing appointment cancel, check-in. This does NOT include a recall, booking a new
  appointment or rescheduling an appointment."
- Low-threshold escalation: "Choose this pathway as soon as transferPhone is set and ANY ONE of
  the following is true. One is enough; do not wait for more."
- Done-exit with a guard: "Choose this pathway if the user said there's nothing else to help
  with… Do NOT choose this pathway if the caller has asked to cancel, reschedule, or change…"
