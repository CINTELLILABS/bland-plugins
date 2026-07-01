# Changelog

## 1.4.0 — 2026-07-01

- `/norm:loop` is now **truly autonomous**: resurrected the Stop-hook convergence gate (`hook-loop.cjs` + `norm-loop.cjs`, modernized to the passthrough surface). The command arms `.norm/loop.json` at setup and records every simulation verdict; while the target fails, the Stop hook blocks the turn from ending and re-feeds the exact failing outcomes (documented `decision: "block"` + `reason` contract). Releases on convergence, `--max` passes (default 8), stall (same failures twice), 24h staleness, or a deliberate `norm-loop.cjs stop`. Session-isolated and fail-soft — never fires outside an armed loop.

## 1.3.1 — 2026-07-01

- Configure panel order: API key (required) first, URL (optional) second.

## 1.3.0 — 2026-07-01

- API key stays **encrypted in the OS keychain** (`sensitive: true`). Onboard/rotate via the plugin's interactive install prompt or `claude plugin install norm@bland --config bland_api_key=...`; the key never touches a plaintext file or the chat. (Supersedes a brief 1.2.x that tried plaintext settings.json + a native dialog — reverted for security; the keychain is more secure than a file.)
- `/norm:config` still switches the non-sensitive `bland_api_url` without reinstalling.

## 1.1.0 — 2026-07-01

- `/norm:config` — switch the Bland API URL (prod ↔ dev tunnel) without reinstalling; documented-storage write + restart note. Key stays in the OS keychain.
- README: "Switching environments" section incl. key-rotation guidance.

## 1.0.0 — 2026-07-01

- Rebuilt onto the live `/v1/mcp` action-widget surface: client-side file workspace + MCP passthrough (`bland_api_get` / `call_bland_api`); offline `norm-sync.cjs` codec powered by the real bundled engine.
- Pathway saves via `/v1/convo_pathway/*` (create-version / update / publish); `POST /v1/pathway/<id>` retired (SMS router).
- `validate_pathway` (change-aware compiler + pathway-canvas widget), `get_pathway_schema` (structured-surface shapes), `get_pathway_context` (deep node/edge/dependency semantics) wired into `super_norm` and the `/norm:*` commands.
- `/norm:test` + `/norm:loop` use the Claude-native Pathway Chat simulation (`/v1/pathway/chat/*`).
- Skill + hook doctrine updated to the file-first model (structured YAML is hand-edited, schema-guided, compiler-gated).
