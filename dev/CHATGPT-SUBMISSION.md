# Submitting to the ChatGPT plugin directory

The package includes review fixture IDs and a fixed analytics period. The October 2 OAuth MCP rehearsal passed agent listing, call inspection, documentation lookup, and saved-agent inspection; analytics returned `handler_error`. Fresh-chat negative cases and testing the packaged plugin in ChatGPT remain outstanding, along with reviewer access, the demo video, and hosted-server verification below. A successful ZIP build does not verify the live requirements.

## Package contents

Run `dev/scripts/build-chatgpt-zip.sh` to create `.tmp-chatgpt-build/bland-plugin-2.2.0.zip` (the version comes from the manifest). A custom output directory is supported; other files in it are preserved. Each build creates a fresh archive, so removed skills cannot remain in an old ZIP.

| Source | Path inside `bland/` in the ZIP |
|---|---|
| `.codex-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| `dev/chatgpt/mcp.json` | `.codex-plugin/mcp.json` |
| `dev/chatgpt/skills/` | `skills/` |
| `dev/chatgpt/README.md` | `README.md` |
| `assets/`, `LICENSE` | `assets/`, `LICENSE` |

The compatibility `.codex-plugin/` layout is supported. Local host skills, commands, agents, hooks, scripts, API-key MCP configuration, and development files are excluded. The root `skills/` and other hosts' installations continue to use their existing workflows.

The ChatGPT skills use the existing named MCP tools. They cover v2 agents, calls, aggregate analytics, supplied pathway graph validation, existing evaluation judges/runs, and docs. Legacy pathway discovery/editing, local simulations, dashboard/schema creation, automations, custom tools, and knowledge-base creation are not promised by this package. Those need suitable named server operations before adding executable workflows here. Documentation lookup can still explain those product features.

Agent changes can be prepared for the user to apply in Bland's editor. Saving through MCP is allowed only when the named tool accepts a version precondition and atomically rejects a stale write; the required version or revision must also be available from the read tools. Until that contract is available and verified, the skill must not save agent changes through MCP.

## 1. Hosted server: verify before submission

These are release gates, not claims that the server is deployed. Keep deployment revisions and operational test evidence in private release tracking. Plugin instructions cannot restrict the server's actual tool list or authorization.

- [ ] **OAuth in ChatGPT:** verify resource metadata, authorization-server discovery, authorization code + S256 PKCE, ChatGPT client ID metadata documents, exact resource/audience binding, organization selection, token refresh, and reconnect after expiry/revocation. Test denial of cross-organization reads and writes. Dynamic client registration is not required if the chosen ChatGPT client-registration flow works.
- [ ] **Organization access:** test an eligible customer owner/admin account with an active organization API key. Verify both first connection and a real named API-backed tool call; a successful login alone is insufficient.
- [ ] **Purchasing change:** verify OAuth `tools/list` omits credit/subscription purchase tools and direct `tools/call` rejects them. Check tool errors, widgets, and server instructions for purchase or wallet prompts. API-key clients can retain their separate behavior. Keep `commerce: false` only when the deployed ChatGPT surface matches it.
- [ ] **Generic executors:** ensure the public OAuth surface does not expose `bland_api_get` or `call_bland_api` as unrestricted routes into unreviewed operations. Register supported operations as individual tools; prevent purchase access through alternate dispatch paths too. Simply excluding the API skill from the ZIP is insufficient.
- [ ] **Secrets:** ensure tool results, snapshots, logs, and errors redact literal credentials, authorization headers, and secret values. Review config reads/writes as well as dedicated secret tools. Skill instructions cannot prevent sensitive values from entering model context when the server returns them.
- [ ] **Tool review:** verify accurate descriptions, bounded schemas, permissions, and `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` for every exposed tool. Remove fallback descriptions that tell ChatGPT to use excluded executors or purchases.
- [ ] **Domain verification:** serve the platform-issued token as plain text at `https://api.bland.ai/.well-known/openai-apps-challenge` and complete the platform check. Configure this on the server.
- [ ] **Identity claims:** verify UserInfo claims match what Bland actually verifies. Do not promise verified-email workspace restrictions if `email_verified` is false.

Start discovery checks with:

```sh
curl --fail --silent --show-error https://api.bland.ai/.well-known/oauth-protected-resource/v1/mcp
```

Then follow the advertised authorization-server metadata and exercise the full flow in ChatGPT. A JSON discovery response alone is not a passing OAuth test.

## 2. Plugin / submission owner: finish before upload

### Final listing and reviewer fixtures

- [x] **Listing pages:** verified public HTTPS pages on October 1, 2026: [website](https://www.bland.ai), [help center with Contact Support](https://docs.bland.ai/welcome-to-bland), [privacy](https://www.bland.ai/legal/privacy), and [terms](https://www.bland.ai/legal/terms). The previous `/support` URL returned 404; `/contact` redirects to a sales demo. The manifest now uses the help center and direct legal URLs. Marketing/legal continues to own those pages' content.
- [x] **Listing artwork:** use the supplied monochrome Bland mark at `assets/icon.svg` (400 × 400) for `composerIcon`, and the red-and-cream Bland mark at `assets/logo.png` (256 × 256) for `logo`. Confirm the appearance in the platform preview before submission.
- [ ] **Review organization:** provision a dedicated account and organization with stable, non-sensitive fixtures and the required permissions/entitlements. Provide a login method the reviewer can complete without MFA, phone codes, magic links, or private-network access. Verify it from a fresh session. If the current sign-in flow cannot do this, coordinate with the authentication service owner.
- [x] **Test placeholders:** the manifest now references the Norma demo agent, the completed review test call, and October 2, 2026, 16:17–16:20 UTC. It retains five positive and three negative cases. Only fixture IDs and timestamps are included; phone numbers, credentials, and raw account responses stay outside the public package.
- [ ] **Five positive cases:** rerun all cases against the packaged plugin in ChatGPT. The analytics case currently fails with `handler_error`, including a minimal count query without grouping; expected counts and completion rate remain unverified. Do not infer organization-wide totals from one known call.
- [ ] **Three negative cases:** run each prompt in a fresh chat with the packaged plugin enabled and check both the response and tool trace. The missing-ID case must have no call ID in prior context. An instruction review or an absent purchase tool does not prove prompt-level behavior or direct-dispatch enforcement.
- [ ] **Expected results:** record fixture names, expected call totals/completion counts, the saved configuration, and relevant call facts in the private reviewer instructions. Check every expected tool and outcome against the connected deployment. Do not seed these tests with customer data.
- [ ] **Demo:** replace `extensions.com.openai.review.demo_recording_url` (`https://bland.ai/plugin-demo` is a placeholder) with a reviewer-accessible recording demonstrating connection and the five positive cases. Avoid exposing credentials or private data.
- [x] **Launch metadata:** use the name Bland, subtitle "Manage voice agents and calls", and Developer Tools category. The owner confirmed `hello@bland.ai` as the contact and US, CA, GB, AU as the launch countries. The description and release notes cover the packaged workflows.
- [ ] **Credentials:** provide reviewer credentials through the platform's private Review details fields, never through Git, the ZIP, or chat.

### Validate and submit

1. Run `python3 dev/scripts/test-chatgpt-package.py` and `dev/scripts/build-chatgpt-zip.sh`. The local test checks packaging and references; it intentionally allows the tracked review placeholders above and does not certify submission readiness.
2. In ChatGPT, test connect/disconnect/reconnect, the five positive cases, the three negative cases, and ambiguous/missing IDs. Confirm prompts never request API keys or invoke absent local scripts. Use dedicated fixtures for any call, evaluation, or deployment tests; these can have costs or external effects.
3. Have an organization owner or a user with Apps Management Write access complete identity verification and open [the submission platform](https://platform.openai.com/plugins).
4. Upload the final ZIP with its MCP configuration in the initial submission. Resolve Metadata & Skills findings, connect the MCP under MCPs, complete domain verification, and pass the tool scan. Inspect the actual tools exposed under OAuth, including those unused by the skills.
5. Fill private Review details, verify the prefilled cases/video/release notes, then submit. After approval, publish explicitly. Treat the production MCP URL as a stable release contract; check current platform rules before changing it.

## Maintenance and sources

Recheck the hosted MCP's live schemas after deployment and whenever named tool contracts change. Keep private source references and validation evidence in internal release tracking. Keep ChatGPT skill updates in `dev/chatgpt/skills/`; changes to local skills are not automatically included.

OpenAI docs checked October 1, 2026:

- [Extensions](https://developers.openai.com/plugins/build/extensions)
- [Authentication](https://developers.openai.com/plugins/build/auth)
- [Build skills](https://developers.openai.com/plugins/build/skills)
- [Package plugins](https://developers.openai.com/plugins/build/plugins)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [Submission](https://developers.openai.com/plugins/deploy/submission)
- [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
