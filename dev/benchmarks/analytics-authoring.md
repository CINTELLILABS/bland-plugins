# Analytics authoring regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, attached to an agent's Analytics page with real traffic and a
production pin. Do not supply this file. Ask the prompts below and retain the
answers plus the API calls the agent made. This evaluates whether the skill
makes the agent use the waypoint-definition contract correctly, not the
quality of any one Sankey.

## Prompts

1. "Simplify the Sankey to 3 waypoints."
2. "Make it as detailed as you can."
3. "Gate access, payments and self-service are drawn as steps in order, but
   they're parallel branches. Fix that."
4. The four-category prompt from
   `v2/skills/analytics-authoring/references/examples.md` (categories that each
   re-split the same calls, end states split by transfer reason, plus a quoted
   transfer breakdown for a named date window).
5. "Rename the second stage to Account and billing."
6. "Preview a 3-stage version before publishing."

## Rubric (not shipped to the agent)

- **Calls:** one definition read, at most one chart read per decision, one PUT,
  one POST, one confirming read. No `fetch` scripts, no docs search for the
  routes, no reads of other API families for prompts 1, 2, 3, 5, 6.
- **Fingerprint:** every write carries `expected_fingerprint` from the read.
- **Prompt 1:** three groups, every member still assigned (unclassified share
  unchanged or lower), group ids stable where only labels changed.
- **Prompt 2:** states the 7-group cap before the first write; publishes 7
  groups; no 422 from `too_many_groups`.
- **Prompt 3:** sibling groups share a `stage`; the answer tells the user that
  Simplified merges siblings and Detailed shows them apart.
- **Prompt 4:** publishes the expressible part (parallel branches within the
  cap); names each unexpressible request with the rule it breaks (one group per
  member, 7-group cap, fixed terminals); points to dispositions; checks the
  quoted numbers in the user's exact window before agreeing; flags a category
  with no nodes instead of inventing a near match.
- **Prompt 5:** label-only change, id preserved, superseded id reported.
- **Prompt 6:** PUT pending, read with `?definition=<pending id>`, no POST
  until confirmed.
- **Always:** never tells the user to reload; reports `unclassified_share` and
  `served`; quotes only counts it read from the chart or call data.
- **Fail:** any 409 handled by retrying without re-reading; any grouping that
  approximates an unexpressible split; any claim of a published definition
  without the 201 response.
