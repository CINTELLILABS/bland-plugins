# Submitting to the ChatGPT plugin directory

The Codex-local install (`.codex-plugin/`, `.agents/plugins/marketplace.json`) works today with an API key in the environment. The public ChatGPT directory has stricter rules, and most of them land on the hosted MCP server, not this repo.

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
- `extensions.com.openai.review.test_cases`: the `<PATHWAY_ID>` in the validate case and the `<CALL_ID>` in the call case need a real pathway and a real call in the reviewer's organization.
- `assets/icon.svg`: placeholder composer icon. It follows the required shape (monochrome, `currentColor`, 20px viewport, 1.33px stroke) but should be replaced with the brand mark from the OpenAI Figma icon template.
- `publication.countries`: confirm the launch list.

## What the hosted MCP server provides

The directory rules for the server are covered on `api.bland.ai`:

1. OAuth 2.1 authorization-code flow with PKCE (S256). Tokens are bound to `https://api.bland.ai/v1/mcp` and act in one Bland organization, chosen by an owner or admin on Bland's consent screen.
2. Protected resource metadata at `https://api.bland.ai/.well-known/oauth-protected-resource/v1/mcp`, naming the authorization server, whose metadata advertises `code_challenge_methods_supported: ["S256"]`.
3. Client ID metadata documents, which ChatGPT uses. Dynamic client registration is not offered at launch.
4. `https://api.bland.ai/.well-known/openai-apps-challenge` serving the domain-verification token as plain text. Give the token from the platform to the Bland server team; it is configured on the server, not in this repo.
5. Explicit `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` on every tool. The two purchase tools are marked destructive.
6. A UserInfo endpoint that returns `email` and reports `email_verified: false`: Bland does not verify ownership of an account's email, so workspace domain restrictions that require a verified email are not supported.

Before you upload, check that discovery answers: `curl -s https://api.bland.ai/.well-known/oauth-protected-resource/v1/mcp` returns JSON, not a 404.

## Reviewer account

- Signs in with Google, with no 2FA. Phone codes and SSO cannot be used by a reviewer.
- Owns a Bland organization and has created an org API key in it. Tools that call the Bland API act through that key and fail without one.
- Has the pathway and the call named in the test cases.

On connect, ChatGPT asks for read and write access to the workspace. The purchase scopes (`credits:purchase`, `plan:purchase`) start unchecked. A purchase tool asks for its scope when it runs, and the reviewer checks it on the consent screen.

## Submission steps

1. Org owner or Apps Management Write role at platform.openai.com/plugins, with identity verification done.
2. `dev/scripts/build-chatgpt-zip.sh` and upload the ZIP. The MCP server must be in the first upload; it cannot be added to a skills-only plugin later.
3. Resolve automated findings under Metadata & Skills. Connect the MCP under MCPs, pass domain verification and the tool scan.
4. Under Review details: the reviewer account's credentials (see Reviewer account). Test cases, video, and release notes are prefilled from the manifest.
5. Submit for review. One review at a time; feedback comes by email.
6. After approval, publish. The MCP URL is frozen after publish; changing it means contacting OpenAI support.
