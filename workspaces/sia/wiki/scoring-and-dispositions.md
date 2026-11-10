# Scoring and dispositions

Use three separate signals: frozen scorer output, customer disposition results, and your judgment from call evidence. Neither a high score nor a customer label establishes a cause. A below-threshold call becomes a successful control only after reviewing its actual behavior.

Map CSV score IDs through the frozen `disposition_version_id`; `inspect-run.cjs` does this. CSV `deployment` and `prompt_version` identify the scorer, not the voice agent. `scored_at` is not call time. Manifest membership and pinned configurations determine cohorts.

Before ranking, read customer outcomes for the batch and each exact published definition used. Interpret success, exclusions and nulls from that definition; do not assume “resolved” means caller satisfaction. Preserve all calls in coverage. Excluded calls can still expose defects, but report their impact separately from eligible calls; unknown eligibility is not false.

`list_agent_call_disposition_runs` returns the latest production result per call/disposition without rationale. The reader excludes `bland_call_scoring` from its customer-outcome view. Keep frozen CSV scorer identity and fetched customer version/time distinct. Missing, failed, null and false outcomes are different states. A label contradicted by execution evidence stays disputed, not silently overwritten.

Source when available: `apps/api/src/routes/agents/v2/dispositionContracts.ts` and `runbooks/call-scoring-decider.md` in SERVER.
