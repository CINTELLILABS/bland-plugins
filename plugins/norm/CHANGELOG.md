# Changelog

## 1.2.0 — 2026-07-01

- `/norm:setup` — onboard your Bland API key via a **native OS dialog** (macOS/Windows/Linux); the key never touches the chat/model context. This is the Desktop-app path (the plugin manager collects no config).
- `bland_api_key` flipped from `sensitive` (OS keychain) to the documented non-sensitive storage (`settings.json`, mode 0600) so `/norm:setup` and `/norm:config` can write it and `${user_config.*}` resolves it. **Migration:** if you installed while it was keychain-stored and the key lived only there, run `/norm:setup` once (or reinstall with `--config bland_api_key=...`).

## 1.1.0 — 2026-07-01

- `/norm:config` — switch the Bland API URL (prod ↔ dev tunnel) without reinstalling; documented-storage write + restart note. Key stays in the OS keychain.
- README: "Switching environments" section incl. key-rotation guidance.

## 1.0.0 — 2026-07-01

- Rebuilt onto the live `/v1/mcp` action-widget surface: client-side file workspace + MCP passthrough (`bland_api_get` / `call_bland_api`); offline `norm-sync.cjs` codec powered by the real bundled engine.
- Pathway saves via `/v1/convo_pathway/*` (create-version / update / publish); `POST /v1/pathway/<id>` retired (SMS router).
- `validate_pathway` (change-aware compiler + pathway-canvas widget), `get_pathway_schema` (structured-surface shapes), `get_pathway_context` (deep node/edge/dependency semantics) wired into `super_norm` and the `/norm:*` commands.
- `/norm:test` + `/norm:loop` use the Claude-native Pathway Chat simulation (`/v1/pathway/chat/*`).
- Skill + hook doctrine updated to the file-first model (structured YAML is hand-edited, schema-guided, compiler-gated).
