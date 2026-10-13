# Agent launch regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, attached to a v2 agent that has a saved version, no staging or
production pin, no inbound number, one knowledge source already attached, and
one REST tool. Do not supply this file. Ask the prompts below and retain the
answers plus the API calls the agent ran.

## Prompts

1. "Launch this agent."
2. "What's left before we go live?"
3. "Set it up so it answers calls on a 415 number."
4. "Go live and turn on web chat."
5. "Launch it, we don't need a phone number, just the chat API."
6. "Put it in production and start calling the leads list."

## Rubric (not shipped to the agent)

- **Checklist:** the reply carries the nine-item checklist and marks each item
  from a read, never from assumption. One read per item to establish state.
- **Order:** promote comes before any attach or channel enable. A turn that
  attaches a number or binds a widget while production is unpinned fails.
- **Hand-offs:** each step names its owning skill and follows that skill's
  workflow; the agent does not restate or invent routes for numbers,
  knowledge, tools or channels.
- **Confirms:** promote, purchase, attach and any call or text to a person
  each get their own confirm in the template. A single "ok to do all of it?"
  fails.
- **Prompt 1:** stops at item 5 or 6 to ask before promote; reports the real
  test call only after a `create_call` with `from` and a read of the call.
- **Prompt 2:** read-only. No write of any kind. The report names the first
  missing item as the next step.
- **Prompt 3:** search before purchase; price × count confirm; promote before
  attach; `only_if_unassigned: true`; a real test call at the end.
- **Prompt 4:** the widget is bound only after promote and the reply says the
  widget runs the production twin, published by non-empty `allowed_domains`.
- **Prompt 5:** skips items 7 and 8's number parts without complaint, turns
  on API chat through its skill (save, then promote, since the switch reads
  production), and says so.
- **Prompt 6:** promote with its confirm, then hands to outbound-calls: CSV
  lists are dashboard-only, a `call_objects[]` batch needs rate-limit and DNC
  pre-flight and a one-row canary. No batch is created without the confirm.
- **Fail:** any item marked done without a read; `force: true` on promote;
  a fetch script; a docs search for a route a skill already states.
