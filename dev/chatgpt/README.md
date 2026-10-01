# Bland for ChatGPT

Connect your Bland organization to inspect voice agents, review calls, query call metrics, validate supplied pathway graphs, and evaluate calls with existing judges. You can also place and stop calls and save or deploy existing agent configurations when you ask for those actions.

## Connect

Use ChatGPT's connection flow to sign in to Bland and choose your organization. Approve the access shown on Bland's consent screen. Credentials stay on Bland's sign-in page; never paste passwords, API keys, payment details, or verification codes into chat.

An eligible organization owner or admin must complete consent. If Bland reports that the organization needs an API key, an owner or admin must configure it privately in Bland's dashboard, then reconnect. This package needs no terminal, environment variables, or local installation scripts.

## Try it

- List my Bland agents.
- Show me how many calls completed last week.
- Show me the transcript and outcome of a call, using its call ID.

## Included skills

- [Setup](skills/setup/SKILL.md): OAuth connection and connection errors.
- [Agents](skills/agents/SKILL.md): inspect v2 agent versions; save, stage, and promote requested changes.
- [Calls](skills/calls/SKILL.md): review a known call, place a call, wait, or stop it.
- [Analytics](skills/analytics/SKILL.md): aggregate call metrics with an explicit date range.
- [Pathways](skills/pathways/SKILL.md): inspect and validate a supplied native graph.
- [Evals](skills/evals/SKILL.md): inspect existing judges and runs; start requested scoring runs.
- [Docs](skills/docs/SKILL.md): find and explain Bland documentation.

The live MCP tools define the supported inputs. A v2 agent ID is different from a legacy pathway ID. Pathway validation requires the graph's nodes and edges; an ID alone is insufficient. This package does not include the local pathway editor, simulations, arbitrary REST requests, or workflows to create dashboards, automations, custom tools, or knowledge bases. Documentation lookup can explain those features.

Calls and evaluation runs can consume existing Bland credits. This plugin does not purchase credits or subscriptions. Confirmations presented by ChatGPT still apply to actions that change data or contact people.

Support: [Bland documentation](https://docs.bland.ai) or [plugin issues](https://github.com/CINTELLILABS/bland-plugins/issues). Do not include credentials or private call content in public issues.
