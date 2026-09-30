# Submitting to the ChatGPT plugin directory

The Codex-local install (`.codex-plugin/`, `.agents/plugins/marketplace.json`) works today with an API key in the environment. The public ChatGPT directory has stricter rules, and most of them land on the hosted MCP server, not this repo. Server work is tracked in [BLA-8366](https://linear.app/blandai/issue/BLA-8366).

## What the directory build changes

`dev/scripts/build-chatgpt-zip.sh` assembles the submission ZIP from a subset of the repo:

| Included | Left out | Why |
|---|---|---|
| `.codex-plugin/plugin.json` | `hooks/`, `bin/` | Plugins with lifecycle hooks cannot be submitted. |
| `dev/chatgpt/mcp.json` as `.codex-plugin/mcp.json` | `.codex-plugin/mcp.json` | ChatGPT cannot present an API key; the server must use OAuth 2.1. |
| `skills/`, `assets/`, `README.md`, `LICENSE` | `commands/`, `agents/`, `dev/`, other host manifests | Codex and ChatGPT read skills and the MCP server only. |

## Placeholders to replace before upload

These values in `.codex-plugin/plugin.json` are fillers:

- `interface.supportURL`, `privacyPolicyURL`, `termsOfServiceURL`: must resolve over HTTPS. Marketing owns the final pages.
- `extensions.com.openai.review.demo_recording_url`: a walkthrough video of the five positive test cases.
- `extensions.com.openai.review.test_cases`: the `<PATHWAY_ID>` in the validate case needs a real pathway in the reviewer account.
- `assets/icon.svg`: placeholder composer icon. It follows the required shape (monochrome, `currentColor`, 20px viewport, 1.33px stroke) but should be replaced with the brand mark from the OpenAI Figma icon template.
- `publication.countries`: confirm the launch list.

## Server prerequisites (blocking)

None of the following can be tested until `api.bland.ai` answers the OAuth discovery endpoints. As of 2026-09-30 they all 404 and `/v1/mcp` returns a bare `Bearer realm="bland"` challenge.

1. OAuth 2.1 authorization-code flow with PKCE (S256) that issues user-scoped tokens the MCP endpoint accepts as bearer.
2. `https://api.bland.ai/.well-known/oauth-protected-resource` pointing at the authorization server, whose metadata advertises `code_challenge_methods_supported: ["S256"]`.
3. Dynamic client registration or client ID metadata documents. ChatGPT is not a pre-registered client.
4. `https://api.bland.ai/.well-known/openai-apps-challenge` serving the domain-verification token as plain text.
5. `readOnlyHint`, `destructiveHint`, and `openWorldHint` set as explicit booleans on every tool.
6. Optional: a UserInfo endpoint returning `email` and `email_verified` if workspace domain restrictions are wanted.

## Submission steps

1. Org owner or Apps Management Write role at platform.openai.com/plugins, with identity verification done.
2. `dev/scripts/build-chatgpt-zip.sh` and upload the ZIP. The MCP server must be in the first upload; it cannot be added to a skills-only plugin later.
3. Resolve automated findings under Metadata & Skills. Connect the MCP under MCPs, pass domain verification and the tool scan.
4. Under Review details: reviewer test credentials (no MFA, no magic links). Test cases, video, and release notes are prefilled from the manifest.
5. Submit for review. One review at a time; feedback comes by email.
6. After approval, publish. The MCP URL is frozen after publish; changing it means contacting OpenAI support.
