# Bland (agent onboarding)

Gives an AI agent its own Bland phone number, without a human ever pasting an
API key.

The agent shows a person a short code and a link. The person opens it, signs in
or signs up, subscribes to the Agent Phone Plan, and approves. The agent then
receives its own organization API key and a provisioned US number, and can place
and receive calls from that moment on.

## How it differs from the `bland` plugin

Both expose the same Bland tools. They differ in how they authenticate.

| | `bland` | `bland-agent` (this one) |
|---|---|---|
| Transport | HTTP to `api.bland.ai/v1/mcp` | stdio, `npx bland-cli mcp` |
| Needs an API key to install | **yes** | no |
| Agent can obtain its own key | no | **yes** |
| Requires Node on the host | no | yes |

Use `bland` when the person already has an API key and wants the hosted server.
Use `bland-agent` when the agent should onboard itself, which is the case for a
hosted assistant whose user has never heard of Bland.

## Setup

Install the plugin. There is nothing to configure.

If the host already has a Bland API key in `BLAND_API_KEY`, or a profile saved
by `bland auth login`, the agent uses it and skips the approval step entirely.

## The flow

1. The agent calls `bland_auth_login` and gets back a code and a link.
2. It shows both to the person and tells them to approve.
3. It calls `bland_auth_poll` every few seconds until the status is `approved`.
4. The key is saved to the host's profile. Every other `bland_*` tool now works.

The key is never returned to the agent's context. It is written to the profile
and read from there by the other tools.

## Tools

`bland_auth_login` and `bland_auth_poll` bootstrap the credential. The rest cover
calls, pathways, personas, knowledge bases, SMS, numbers, tools, analytics and
evals. Run `npx bland-cli mcp` and list tools to see the full set.

## Requirements

- Node 18 or newer on the machine running the MCP server.
- A person who can approve the request and has, or is willing to start, an Agent
  Phone Plan subscription.
