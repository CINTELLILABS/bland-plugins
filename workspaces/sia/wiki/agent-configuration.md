# V2 configuration

Work on the full raw snapshot: `behavior.nodes/edges`, `settings`, `contact`, plus every existing optional field. API response envelopes and version metadata are not snapshots. Identify call-time version separately from today's production pointer; a historical baseline is sufficient for a local repair, with drift recorded for handoff.

Preserve node/edge IDs, unknown fields, layout and tool/snippet pins. Check `channelConfig` before editing: a channel override can supersede the shared prompt. Root `scenario` prompt text is `data.rule`; hub and prompt steps use `data.prompt`. Nested `data.flow` holds its own start, steps and end. Flow end returns control; it is not necessarily a hang-up.

Condition formats differ: deterministic edge rows use `operator: AND|OR` plus `conditionOperator`; route-step rows put the comparison in `operator`. Do not transplant one format into the other. An attached tool can run an embedded definition or a library reference; preserve that distinction. A `customCode` step executes its snippet pin, not its display code.

Consult the managed product documentation and installed Norm snapshot guidance for the relevant field. The source types and validator live in `packages/api-types/src/agentConfig/` and `apps/api/src/lib/agents/` when SERVER source is available.
