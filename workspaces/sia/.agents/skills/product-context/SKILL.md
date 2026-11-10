---
name: sia-product-context
description: Resolve a specific Bland V2 schema, runtime or tool-capability question during diagnosis, editing or testing.
---

# Resolve product context

Start with the relevant short note: [configuration](../../../wiki/agent-configuration.md), [scoring](../../../wiki/scoring-and-dispositions.md), [tools](../../../wiki/tool-access.md) or [testing](../../../wiki/testing.md). Stop when the question is answered.

For missing context, use `search_bland_docs` with the exact feature, then `get_bland_doc` for the matching page. Tool schemas determine callable inputs. If docs disagree with behavior or omit a field, inspect the owning SERVER file linked in the note; identify the source revision and distinguish it from deployed behavior. Read only the relevant type, validator, compiler or test. Cache the finding and source in the private run evidence; change a product note only for a reusable, non-sensitive correction.

In hosted Norm, use its managed API bridge and relevant installed plugin reference. The SERVER checkout and desktop connectors may be absent. Resolve the specific contract through available docs/tools or record the dependent gap.

V2 candidates are full `{behavior, settings, contact, ...}` snapshots. Legacy `get_pathway_context` and `validate_pathway` accept a different graph and cannot validate a V2 snapshot. Use the server's V2 snapshot validator through the scoped brief preview and check local edit scope; never reshape the agent to fit a legacy tool. Documentation describes capabilities, not permission to invoke side effects.
