# Norm — Build Things Cheat Sheet

Build and test Bland voice agents from Claude Code. Describe what you want; it does the work.

## Install (once)

```
claude plugin marketplace add CINTELLILABS/bland-plugins
claude plugin install norm@bland --config bland_api_key=YOUR_KEY   # key: app.bland.ai → API keys
```

Restart your Claude Code session. Done.

## Build or rebuild a call flow

- `/norm:norm build me a booking flow that collects name, callback number, and appointment time, confirms it back, and texts a confirmation` — it designs the pathway, validates it with the real compiler, and saves it.
- Rework an existing one: `/norm:clone <pathway_id>` → the pathway becomes local files (prompts as markdown, config as YAML) → tell it what to change → `/norm:validate` → `/norm:commit`.
- Rebuild from a real call that went well (or badly): `/norm:loop <pathway_id> --from-call <call_id>` — it turns the call into a target and reworks the flow until it matches.

## Test end to end

- `/norm:test` — it plays the customer in a simulated call against your pathway (text, no real dial) and checks the outcomes against the transcript.
- `/norm:loop <pathway_id> --goal 'caller books an appointment and gets a confirmation'` — the self-driving version: it derives a checklist from your goal, simulates, grades every outcome with evidence, fixes the flow, and repeats until everything passes. Walk away, come back to a working pathway.

## Build a tool (give the agent an API to call)

- `/norm:tools build a tool that looks up an order by number in our API and tells the caller the status` — it designs the tool (inputs, response mapping, what the agent says while it runs), **test-runs it against the real endpoint before attaching it anywhere**, and wires secrets by reference so credentials never appear in the definition.
- Integration tools (Slack, HubSpot, calendars…): same command — it checks the org's existing tools and the integration catalog first so you don't build duplicates.

## Set up citations (structured outcomes captured per call)

- `/norm:analytics define an outcome schema: did they book, the appointment time, and why not if they didn't` — it designs the extraction variables (typed, with options), creates the schema, and **verifies it on a few real calls before you trust it**.
- Then every call gets those fields extracted — filter and chart them: `/norm:analytics booking rate by week`.

## Score every call automatically

- `/norm:evals` builds LLM judges (generate one from a plain description, from a real call, or from a filed issue), calibrates them against calls where you know the right answer, and assembles them into a weighted scorecard.
- Attach the scorecard to your calls and every call auto-scores after it ends — verdicts land as pathway tags with reasoning + evidence quotes, ready to trend in analytics.

## See how it's doing

- `/norm:analytics how many calls this week and what % completed` — real numbers from real queries, never guesses.
- `/norm:analytics build me an ops dashboard` — creates a live board in the Bland UI (volume, completion, outcomes) with every panel's query proven first.
- `/norm:review <call_id>` — what actually happened on one call: routing, variables, where it broke, with the exact transcript lines as proof.

## Everything else

- `/norm:persona` — voices + call config; `/norm:knowledge` — knowledge bases the agent cites mid-call; `/norm:api` — any raw Bland API call, docs-first; `/norm:list` — see your pathways.

**House rules:** it never invents numbers or verdicts (everything is backed by a query, read-back, or transcript quote) · reads are free, anything that mutates/costs/dials asks first · your API key stays in the OS keychain and never appears anywhere.
