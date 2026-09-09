# Migration plan: four plugins to one `bland` plugin

## TL;DR

Today this repo ships four plugins across two marketplaces that disagree with each other: `norm` (Claude only, the real product), `bland` (Cursor only, MCP config and nothing else), `bland-agent` (a second MCP with a different tool set, for agents that onboard themselves), and `bland-lab` (a stale copy of norm that nobody lists). Inside `norm`, twelve commands are thin wrappers around twelve same-named agents, and every file lists each MCP tool twice to cover two namespaces.

The target is one plugin named `bland`, one marketplace, one MCP server entry, and a `skills/` tree that works on Claude Code, Claude Desktop, Cursor, and Codex. The MCP entry is a local stdio bridge to the hosted `/v1/mcp` server. It resolves the API key from the environment, the plugin config, or the Bland CLI profile. When it finds no key it serves two login tools that run the device-code flow, so a human can connect it by approving in a browser and an agent can connect it by showing the human a code. Ten domain agents become ten skills. Twenty commands become seven. Two agents remain because they need a separate context.

| | Before | After |
|---|---|---|
| Plugins | 4 | 1 |
| Marketplaces | 2 (listing different plugins) | 1 marketplace, 3 host manifests |
| MCP config files | 5 | 1 |
| Commands | 25 across plugins | 7 |
| Agents | 13 across plugins | 2 |
| Skills | 2 (duplicates) | 12 |
| Install paths for a human | 4 contradictory README sections | 1 page, 2 ways (paste key or approve in browser) |
| Install path for an agent | separate plugin, different tools | same plugin, `bland_auth_login` |

The only new code is a hosted-forwarding mode for the CLI's existing `mcp` command, about 100 lines ported from the bridge already in `norm/bin`. Everything else is moving files, deleting files, and rewriting manifests and docs. Phase 0 below is resolved: the device-code endpoint is on SERVER main, the CLI profile format is known, and the host docs settle how the server is launched.

## Target layout

```
bland-plugins/
  .claude-plugin/marketplace.json     one plugin: bland, source "./"
  .claude-plugin/plugin.json
  .cursor-plugin/plugin.json
  .codex-plugin/plugin.json
  mcp.json                            one entry: npx bland-cli mcp --hosted
  README.md  CHANGELOG.md  LICENSE
  assets/logo.png
  skills/
    setup/            how auth resolves; when to call bland_auth_login
    pathways/         today's authoring-bland-pathways + references/
    api/              from agents/norm-api + commands/api
    analytics/        from agents/norm-analytics + commands/analytics
    evals/            from agents/norm-evals + commands/evals
    call-review/      from agents/norm-review + commands/review
    debug/            from agents/norm-debug + commands/debug
    tools/            from agents/norm-tools + commands/tools
    knowledge/        from agents/norm-knowledge + commands/knowledge
    persona/          from agents/norm-persona + commands/persona
    automations/      from agents/norm-automations + commands/automations
    triage/           from agents/norm-triage + commands/triage
  commands/
    norm.md  loop.md  clone.md  validate.md  test.md  commit.md  status.md
  agents/
    norm.md           today's super-norm
    norm-judge.md     fresh-context grader used by /bland:loop
  hooks/hooks.json
  bin/                _credentials.cjs, norm-sync.cjs, engine.bundle.cjs, hook-*.cjs, norm-loop.cjs (Claude-only, via ${CLAUDE_PLUGIN_ROOT})
  dev/                benchmarks/, scripts/, RELEASING.md, SYNC.md, e2e-test.cjs
```

Skill folders use bare names because the host namespaces them as `bland:analytics`. If we later publish to skills.sh standalone, prefix them then.

## Phase 0: what the design depends on (resolved)

All three questions were answered from the SERVER, bland-cli, and FRONTEND checkouts and the host docs. One item still needs a dashboard check, marked below.

### 1. The device-code endpoint is on SERVER main

Merged 2026-09-08 as PR #10790 (BLA-8011), mounted at `/v1/agent/onboarding` in `apps/api/src/routes/agent_onboarding/`. The approval page is `https://app.bland.ai/agent-setup`, shipped in FRONTEND as `src/pages/AgentSetup.jsx`, also on main.

| Route | Auth | Behavior |
|---|---|---|
| `POST /start` | none | Returns `device_code`, `user_code`, `verification_url`, `verification_url_complete` (with `?code=`), `expires_in`, `interval`. Codes live 15 minutes. Per-IP and global rate limits. |
| `POST /poll` | none | Body `{ device_code }`. Returns `{status: "pending", interval, expires_in}`, `{status: "approved", api_key, org_id, phone_number, plan, client_name}`, or `{status: "expired"}`. A 429 with error `SLOW_DOWN` carries a new `interval`. The key is returned exactly once, here. |
| `POST /approve` | browser session, dashboard origin, org admin or owner | The human half. Never returns the key. Requires an active Agent Phone Plan on the org. |

`/start` sits behind the feature gate `agent_onboarding_device_flow`, an all-on or all-off switch. `/poll` and `/approve` are not gated so in-flight codes finish if the gate is closed. **Still to check:** whether that gate is on in production. The CLI ships `bland auth login --device` against it, which suggests yes, but confirm in the flag dashboard before Phase 3 ships.

The bridge should port `startDeviceAuth`, `pollDeviceAuthOnce`, and `assertDeviceAuthBaseUrl` from `bland-cli/src/lib/deviceAuth.ts`. They are plain `fetch`, refuse non-https and non-`bland.ai` hosts, and treat `SLOW_DOWN` as pending with a new interval.

### 2. The CLI profile file

The CLI stores credentials with the `conf` package, project name `bland-cli`, suffix `nodejs`. Plain JSON, no encryption, atomic writes.

| OS | Path |
|---|---|
| macOS | `~/Library/Preferences/bland-cli-nodejs/config.json` |
| Linux | `$XDG_CONFIG_HOME/bland-cli-nodejs/config.json`, default `~/.config/...` |
| Windows | `%APPDATA%\bland-cli-nodejs\Config\config.json` |

```json
{
  "current_profile": "default",
  "profiles": {
    "default": { "api_key": "sk_...", "base_url": "https://api.bland.ai" }
  }
}
```

`BLAND_API_KEY` in the environment overrides the profile. The CLI reads `BLAND_BASE_URL` for the URL where the plugin reads `BLAND_API_URL`; the bridge should honor both. Writing this file from the bridge after a device-code approval makes the plugin and the CLI share one login.

### 3. How hosts launch a stdio server from a plugin

- **Claude Code** documents `${CLAUDE_PLUGIN_ROOT}` for `command`, `args`, and `env` in a plugin's MCP config. Wildcards in command `allowed-tools` are documented too: `mcp__<server>__*` is valid as long as the server segment is literal. So the seven remaining commands can list one pattern per namespace instead of every tool.
- **Cursor** documents no working directory for stdio servers and no plugin-root variable. Only `${env:NAME}`, `${workspaceFolder}`, and `${userHome}` are interpolated. How plugin `variables` reach a stdio process is not documented either.
- **Codex** plugin docs were not reachable. Its MCP config supports `command`, `args`, and `env`.
- **Claude Desktop** does not pass plugin config to stdio servers as environment, which is why the existing bridge resolves the key from settings and the keychain itself.

**Decision this forces.** A path-based launch is only documented on Claude Code. To make one `mcp.json` work on every host, launch the bridge through npm instead of a path:

```json
{ "mcpServers": { "bland": { "command": "npx", "args": ["-y", "bland-cli@<pinned>", "mcp", "--hosted"] } } }
```

This is what `bland-agent` already does, and it has the same Node requirement. The bridge moves into `bland-cli` as a new mode of its existing `mcp` command: it already owns the device-code client and the profile store, so the new code is only the forwarder, about 100 lines from today's `bland-mcp-proxy.cjs`. The plugin then ships no runtime code except the hooks and the pathway codec, which are Claude-only anyway and can keep using `${CLAUDE_PLUGIN_ROOT}`. The fallback if the CLI team cannot take it this cycle: keep the bridge in `bin/`, use `${CLAUDE_PLUGIN_ROOT}` on Claude, and test a relative path on Cursor empirically before listing there.

## Phase 1: repo restructure

Goal: the repo has the target layout with today's content, unchanged in behavior, installable as `bland@bland`.

1. Commit the pending `SKILL.md` golden-references change first so the move has a clean base.
2. `git mv plugins/norm/* .` so the plugin lives at the repo root, matching both reference repos. Move `benchmarks/`, `scripts/`, `bin/SYNC.md`, `bin/e2e-test.cjs`, and `RELEASING.md` under `dev/`.
3. `git rm -r plugins/bland-lab plugins/bland-agent plugins/bland`. Keep `plugins/bland/assets/logo.png` by moving it to `assets/`.
4. Rewrite `.claude-plugin/marketplace.json`: name `bland`, one plugin entry named `bland`, `source: "./"`. Delete `.cursor-plugin/marketplace.json`; the Cursor manifest lives in `.cursor-plugin/plugin.json` at the root.
5. Write the three host manifests from the same metadata: name `bland`, displayName `Bland`, version `2.0.0`, MIT, logo, keywords, `mcpServers: "./mcp.json"`. The Claude manifest keeps `userConfig` for `bland_api_key` (sensitive, optional) and `bland_api_url` (optional). The Cursor manifest carries the same two as `variables`. The Codex manifest adds the `interface` block.
6. Write the single `mcp.json` launching `npx -y bland-cli@<pinned> mcp --hosted`. Delete every `.mcp.json` variant. Until Phase 3 lands in the CLI, point it at `bin/bland-mcp-proxy.cjs` with `${CLAUDE_PLUGIN_ROOT}` and list on Claude only.
7. Delete `bin/bland-mcp-proxy.cjs` and `bin/bland-mcp-desktop` once the CLI mode ships. They are the code being moved.
8. Update `_credentials.cjs` to resolve `bland@*` plugin config entries, keep `norm@*` as a fallback for one release so existing installs keep their key, and add the CLI profile file as a source so the hooks and codec see a device-code login too.
9. Search and replace the plugin id in `hook-status.cjs`, `norm-config.cjs`, and the commands: `norm@bland` becomes `bland@bland`, `/norm:` becomes `/bland:`, and the tool namespace `mcp__plugin_norm_bland__` becomes `mcp__plugin_bland_bland__`.

Verify: install from a local marketplace on Claude Code with a key in config, run `/bland:smoke`, and confirm every row passes as it does today.

## Phase 2: agents become skills, commands shrink

Goal: the same guidance, reachable on every host, with no duplicated descriptions.

1. For each of the ten domain agents, create `skills/<name>/SKILL.md`. The frontmatter has `name`, `description` (the agent's trigger text, trimmed), and `license: MIT`. The body is the agent's prompt with the "You are `norm_x`" framing removed and tool names written bare. Drop `model`, `effort`, `maxTurns`, and the `tools` list entirely.
2. Delete the matching command for each: `api`, `analytics`, `automations`, `debug`, `evals`, `knowledge`, `persona`, `review`, `tools`, `triage`. Their only job was to launch the agent.
3. Delete `list` (clone with no argument lists pathways), `config` (URL override is a config field, documented in the setup skill), and `smoke` (fold into `status --check`).
4. Keep `norm`, `loop`, `clone`, `validate`, `test`, `commit`, `status`. These are verbs a human types with an argument and they wrap `bin/` scripts. Replace each one's tool list with two documented wildcard entries, `mcp__bland__*` and `mcp__plugin_bland_bland__*`, so the files stop carrying forty-line allowlists.
5. Rename `agents/super-norm.md` to `agents/norm.md` and `agents/norm-judge.md` stays. Update `commands/norm.md` and `commands/loop.md` to reference them. Anywhere an agent used to launch a sibling agent, it now reads the sibling skill.
6. Move `skills/authoring-bland-pathways/` to `skills/pathways/` with its `references/`. Rewrite its `/norm:*` references.
7. Write `skills/setup/SKILL.md`: the three-step key resolution, the two login tools, the rule that the key is never pasted into chat, and how to point at a dev server.
8. Delete the duplicate benchmark fixture tree that came from `bland-lab`.

Verify: on Cursor with no commands available, ask for an analytics question and confirm the `analytics` skill loads and answers with a real query. On Claude Code, run `/bland:norm` end to end on a throwaway pathway.

## Phase 3: hosted mode in the CLI's MCP command

Goal: one launch line that works on every host, and a session with no key can sign in from inside it, for a human or an agent. This is a `bland-cli` change, so it needs that team's review; the plugin work in Phases 1, 2, and 4 does not wait on it.

1. Add `bland mcp --hosted`. It reuses the CLI's existing `bland_auth_login` and `bland_auth_poll` tools and its profile store unchanged. Instead of registering the CLI's own 140 tools, it forwards every other MCP message to `<base_url>/v1/mcp` with the resolved key, reusing the server's `Mcp-Session-Id`. The forwarder is today's `bin/bland-mcp-proxy.cjs`, about 100 lines.
2. Key resolution is the CLI's existing order: `BLAND_API_KEY`, then the current profile. Add the Claude plugin config and keychain lookup from `_credentials.cjs` as a third source so a key entered through `/plugin configure` is honored without a CLI login.
3. With no key, `tools/list` returns only the two login tools and every forwarded call returns one structured error: "Not signed in. Call bland_auth_login." After `bland_auth_poll` reports approved, the CLI already saves the key to the profile; the hosted mode then starts forwarding and sends `notifications/tools/list_changed`.
4. `bland_auth_login` already returns the code, the complete verification URL, and a verbatim instruction for the human, and never returns the key. Nothing to change.
5. Pin the CLI version in `mcp.json` and bump it deliberately, as `bland-agent` does today.

Verify: on a machine with no key and no CLI profile, install the plugin, say "log in to Bland", approve at `app.bland.ai/agent-setup`, and confirm the next tool call succeeds without a restart. Repeat with the key supplied only by `BLAND_API_KEY`, only by plugin config, and only by an existing CLI profile. Confirm the `agent_onboarding_device_flow` gate is on in production first.

## Phase 4: docs and release metadata

1. Replace the root README with one page: a two-line pitch, install per host (Claude Code, Claude Desktop, Cursor, Codex), the two ways to sign in, a skills table with one line each, the lifecycle walkthrough from today's `CHEATSHEET.md`, and the update commands. Delete `plugins/*/README.md` and `CHEATSHEET.md`.
2. Fix the install text so it matches what ships. Today the root README documents a setup command that does not exist.
3. Add a `2.0.0` entry to `CHANGELOG.md` that names the rename, the removed commands, and the one-time `uninstall norm@bland` then `install bland@bland` step for existing users.
4. Add `LICENSE` (MIT, as every manifest already claims).
5. Move `RELEASING.md` under `dev/` and update its step 1 to name the three manifests that carry the version.

## Phase 5: verify and ship

Run the dimension checklist from `RELEASING.md`, since every field-reported bug so far came from an environment difference:

- Latest Claude Code, installed from the real marketplace, `/bland:status --check` passes.
- Claude Desktop, key entered through the config panel, `npx` launch succeeds with Desktop's PATH.
- Cursor, key via plugin variables, one skill and one MCP tool exercised.
- Codex, manifest loads and skills are listed.
- A second org's key, to catch data-shape differences.
- No key at all, device-code login, on Claude Code and Cursor.
- One reversible create then delete on a throwaway pathway through `/bland:commit`.

Then tag `v2.0.0`, publish, and raise the plugin name with the owner of `CINTELLILABS/bland-skills`, whose marketplace also lists a plugin named `bland`. Their seven skills fit under `skills/` here unchanged if they choose to fold in.

## Out of scope

- OAuth on the hosted MCP server. It would remove the key step for humans entirely, as ElevenLabs and Cartesia do, but it is a server project and the bridge design above does not depend on it. When it lands, the bridge becomes optional for hosts that support OAuth natively.
- Folding in `bland-skills` or the CLI's tool set. Their tool vocabularies differ from the hosted server's, and the hosted server's REST passthrough already reaches every documented endpoint.
- Rewriting the skill bodies for quality. This plan moves and reframes them. Editing the guidance is separate work.

## Risks

- **The device-code gate may be off in production.** The routes are on main and the CLI ships against them, but `agent_onboarding_device_flow` is a switch. If it is off, Phases 1, 2, and 4 still ship with the paste-a-key path and Phase 3 waits on the flag, not on code.
- **Phase 3 lives in another repo.** The hosted mode is a `bland-cli` change. If that team cannot take it this cycle, the fallback is the bridge in `bin/` with `${CLAUDE_PLUGIN_ROOT}`, listed on Claude only until a relative-path launch is verified on Cursor.
- **Cursor plugin variables may not reach a stdio process.** Undocumented. The CLI profile and device-code login are the paths that do not depend on it, which is one more reason to route everything through the CLI.
- **Existing `norm@bland` users lose their command names.** The changelog and the credential fallback cover the transition. There is no way to alias a plugin id.
- **Node and npm on the host.** Claude Code ships with Node. Cursor users almost always have it. `npx` downloads the CLI on first launch, so the first session needs network and a few seconds. This is the same requirement `bland-agent` already had.
