# Bland Norm Claude Code Plugin

Norm is the Claude Code activation layer for Bland MCP.

The product model is:

```text
Bland API MCP server = capabilities
Norm plugin = Claude Code UX
```

The plugin should not simulate Bland locally or own pathway state. Bland MCP owns capabilities and state; Norm provides `/norm`, `super_norm`, skills, and hooks so Claude uses those capabilities correctly.

## Local Setup

Start the Bland API locally from a server build that exposes `/v1/mcp`.

Configure the plugin with:

- `bland_api_url`: `http://localhost:3000`
- `bland_api_key`: a Bland API key for the org being tested

The plugin MCP config points at:

```text
${bland_api_url}/v1/mcp
```

## User Flow

In Claude Code, use:

```text
/norm:norm create a cat fact phone agent, validate it, simulate a conversation, fix issues, and publish it
```

For local development, install the optional personal `/norm` command shim so you can type:

```text
/norm create a cat fact phone agent, validate it, simulate a conversation, fix issues, and publish it
```

Marketplace plugin slash commands are namespaced by Claude Code, so the portable plugin command remains `/norm:norm`.

## Expected Tool Flow

For creation:

```text
begin_pathway_generation
create_file / write_file / set_variables / set_model_config / set_node_tools
validate_pathway
create_agent_test_scenario
run_agent_test_scenario
get_agent_test_run
commit_pathway_workspace
```

For edits:

```text
list_pathways / get_pathway
begin_pathway_edit
get_pathway_dependency_context / get_node_execution_context / get_transition_context
edit with file and structured tools
validate_pathway
run_pathway_node_test or Agent-to-Agent Testing
commit_pathway_workspace
```

For simulation:

```text
create_agent_test_scenario
run_agent_test_scenario
get_agent_test_run
```

Do not hand-simulate when Bland test tools are available.

## Desktop / Stdio Adapter

`bin/bland-mcp-desktop` is only a stdio-to-HTTP bridge for clients that cannot connect to HTTP MCP directly. It forwards to `${BLAND_API_URL}/v1/mcp` and does not simulate or locally commit anything.
