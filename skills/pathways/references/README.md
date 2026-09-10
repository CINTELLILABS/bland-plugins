# Golden references

Battle-tested production artifacts (sanitized) that show what GOOD looks like on each authoring
surface. These are references to imitate for shape and technique — never templates to copy
verbatim: the brands, facts, and flows belong to their original deployments.

| Reference | Surface | Load when |
|---|---|---|
| [global-prompts/outbound-conversational-sales.md](global-prompts/outbound-conversational-sales.md) | `.pathways/global_prompt.md` | Outbound, warm/rapport-led, earn-one-next-step calls |
| [global-prompts/inbound-direct-support.md](global-prompts/inbound-direct-support.md) | `.pathways/global_prompt.md` | Inbound, task-led, efficiency-builds-trust calls |
| [knowledge-bases/refund-preference-kb.md](knowledge-bases/refund-preference-kb.md) | KB content (Vector DB nodes / fact sources) | Writing KB content a voice agent will draw on |
| [pathways/golden-service-scheduling.md](pathways/golden-service-scheduling.md) | Whole-graph design | Designing a multi-node pathway, tools, edge routing |
| [pathways/golden-service-scheduling.json](pathways/golden-service-scheduling.json) | Raw pathway JSON (~200KB, self-annotated) | Grep for a specific node/edge to emulate — do not read whole |

How to use them:

1. **Read the header first.** Each file opens with "why it's golden" — the specific techniques
   to transfer. The body is the verbatim (sanitized) production artifact.
2. **The two global prompts are a matched pair.** They share a skeleton (persona →
   virtual-assistant honesty → speech behaviors → forbidden patterns → consent-based transfer →
   TTS readout contracts); diff them to see which dials move between "very to the point" and
   "hella conversational". Pick the register that matches the call type, then tune.
3. **Copy techniques, not sentences.** Wrong/right example pairs, negative catalogs with
   replacements, "Say:" blocks, epistemic-limit rules ("the agent cannot see X, so ask what the
   caller sees"), consent-based transfers, honesty gates, structured tool refusals with
   `agent_instructions` — these transfer to any domain. Amy's acknowledgment lines do not.
