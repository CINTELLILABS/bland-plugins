# What the Analytics page draws

Know this before promising what the user will see, and say it when it matters.

## Simplified tab (`view=simple`)

- Draws the published customer definition, else the inferred one, else nothing
  until the structure is ready (5+ conversations).
- Columns are stages in order. A single node per stage. Bars and links are
  transition counts, so a stage visited twice in one conversation draws larger;
  the numbers under a column count conversations once.
- **Parallel branches are merged.** Groups that share a stage draw as one
  column labelled by the first sibling with "+N" (for example "New rental +3").
  The column's count is the first sibling's reach, not the union. The API's
  `stage_reach` carries the union; the chart does not yet show it.
- Three terminals on the right: completed by AI, transferred to staff, hung up.
  A definition cannot change them.
- Whatever no group names draws as "Unclassified". A "Passed over" bar marks
  calls that skipped a stage entirely.

## Detailed tab (`view=detailed`)

- Draws compiled waypoints, not groups. The legend on the right lists each
  group's share, so sibling branches appear apart here (each with its own
  count) even though the Simplified tab merged them.
- The row header for a parallel stage still shows the first sibling's label.
- Use this view to explain where traffic actually goes before you design
  stages, and to show the user parallel branches after you publish them.

## Live refresh

When you save or publish a definition the Analytics page refreshes its chart
on its own and the cursor moves to the Sankey. Do not tell the user to reload.
The refetch takes a few seconds on a 90-day window.

## What to say when you publish parallel branches

"These four branches are parallel (same stage). Detailed shows them side by
side with their own counts; Simplified currently merges them into one column
labelled by the first branch."

## What to say when readiness is not met

"The definition is published and will serve once this structure has 5
conversations; the chart keeps the inferred layout until then."
