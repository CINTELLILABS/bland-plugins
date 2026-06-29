---
name: norm-pathway-workflow
description: Use the Bland Norm workflow through Bland MCP for creating, editing, validating, simulating, testing, committing, publishing, and debugging Bland agents.
---

# Bland Norm Pathway Workflow

This skill is the portable SuperNorm authoring doctrine for Claude Code. Bland MCP exposes the real Bland engine. Treat MCP tool results as source of truth.

## Workflow

For a new pathway:

1. Call `begin_pathway_generation` with a clear name and task.
2. Use `list_files` to inspect the mounted workspace.
3. Create/edit files with `create_file`, `write_file`, `str_replace_based_edit_tool`, and `delete_file`.
4. Use structured editors for structured surfaces.
5. Run `validate_pathway`.
6. Run Test Bed or scenario tests when behavior changed.
7. If validation has no errors, call `commit_pathway_workspace` automatically in the same run.

Do not ask whether to save after the user asked to create, build, edit, fix, or update a pathway. Warnings are reportable, not blocking. If commit fails, say the pathway was not persisted.

For an existing pathway:

1. If the target version is unclear, call `get_pathway` or `list_pathways`.
2. Call `begin_pathway_edit`.
3. Treat the working version returned by the workspace as authoritative.
4. Inspect semantics before non-trivial edits.
5. Validate, test, and commit.

## Workspace Layout

```text
nodes/{shortId}/
  node.md          # YAML frontmatter + prompt body
  condition.md     # empty frontmatter delimiters + loop condition
  variables.yaml   # structured surface, prefer set_variables
  model.yaml       # structured surface, prefer set_model_config
  tools.yaml       # structured surface, prefer set_node_tools

edges/
  {sourceId}-to-{targetId}.md

.pathways/
  global_prompt.md # plain markdown, no frontmatter
  layout.yaml      # read-only
```

Rules:

- Preserve node directory short IDs and frontmatter IDs.
- Edge source/target fields use node short IDs.
- Do not write `.pathways/layout.yaml`.
- Do not create `.pathways/manifest.yaml`.
- `condition.md` must use empty frontmatter delimiters: `---\n---\ncondition text`.
- `global_prompt.md` must not use frontmatter.

## Structured Editors

Use these instead of hand-writing YAML:

- `set_variables` for extracted caller values.
- `set_model_config` for model settings and tags.
- `set_unit_tests` for unit tests.
- `set_node_tools` for webhook/custom/code/tool-chain attachments.
- `set_tool_config`, `set_pipeline_steps`, and `set_pipeline_variables` for pipeline/tool-chain refinement.
- `build_tool_chain`, `create_code_snippet`, and `run_snippet_test` when creating new tool behavior.

Do not invent hidden formats. If a structured editor exists, use it.

## Prompt Standards

- Write for phone calls, not chat.
- For Default nodes, use `Background`, `Goal`, and `Tone` sections when the prompt is more than a very short instruction. This is the validator-preferred shape and prevents `UNSTRUCTURED_DIALOGUE_PROMPT` warnings.
- Prompts are instructions, not scripts. Tell the agent what to accomplish, not exact words to recite unless exact compliance is required.
- Keep language natural, concise, and interruptible.
- Ask one clear thing at a time.
- Avoid IVR openers like "How may I direct your call?"
- Use contractions and spoken phrasing.
- Spell numbers when helpful for voice output.
- Use a complete global prompt with identity, tone, call controls, guardrails, and business context.

## Variables And Placeholders

- Use `set_variables` for values the caller provides during the conversation.
- Only reference `{{variable_name}}` after defining that variable.
- Do not use `{{unknown_business_value}}` for values Claude does not know.
- For unknown business values, write a realistic fake value and call `flag_review_item` with a clear description so a non-developer can replace it.

Examples to flag:

- Company names, product names, pricing, office hours, contact info.
- Webhook URLs, API endpoints, and auth names.
- Policy text that the business must confirm.

## Tool-Bearing Nodes

Treat prompt, condition, tool schema, tool outputs, response pathways, and downstream routes as one runtime contract.

- Inspect existing tool shape before changing it.
- Preserve existing webhook/tool-chain/custom-tool/code-tool shapes unless replacement is required.
- On dialogue nodes, the prompt must name the tool exactly as configured and describe when to call it.
- If routing depends on a tool output, keep that dependency explicit in the condition or route.
- For secrets, call `list_secrets` first. Never guess secret placeholders.
- For REST/webhook tools, inspect auth, input schema, body/url templates, and response extraction before edits.
- For code tools, inspect source with `get_code_tool` before making behavior claims.

## Semantics-First Diagnosis

Before non-trivial edits or debugging:

1. `get_pathway_dependency_context(scope="pathway")`
2. `get_node_execution_context` for touched nodes
3. `get_transition_context` for suspicious routes, transfers, fallbacks, or response pathways
4. Targeted `read_file` only after the runtime contract is clear

If the user gives a call ID, start with `lookup_call`. If they give a cohort or vague symptom, use `search_calls`. Runtime evidence beats prompt assumptions.

## Validation And Testing

- Run `validate_pathway` after meaningful structural changes.
- Fix errors before commit.
- Do not fix unrelated warnings unless they block the requested work or were introduced by your edits.
- Use Test Bed (`run_pathway_node_test`) for prompt, routing, tool, or node behavior changes, especially when a real call is in scope.
- Poll with `get_pathway_node_test_results` if Test Bed returns pending.
- Use `create_agent_test_scenario`, `run_agent_test_scenario`, and batch tools for customer-facing scenario coverage.
- Do not hand-simulate when Bland MCP Test Bed, chat, or Agent-to-Agent Testing tools are available.

## Generation Shape

- Build the smallest practical pathway that handles the requested goal.
- Four to ten nodes is usually enough.
- Add branches only for user-specified or essential flows.
- Use native Transfer Call nodes for human handoff.
- End Call nodes are optional. Add one only when the flow needs an explicit terminal step.
- Every route should describe a real user outcome.
- Do not create linear chains where one node with a good prompt would be clearer.

## Final Response Contract

When done, report:

- Pathway ID and working/persisted version ID if returned.
- What was built or changed.
- Validation status.
- Tests run and result.
- Remaining warnings or review items.
- Any values the user must replace.
