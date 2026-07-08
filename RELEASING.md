# Releasing the Norm plugin

Bugs in this plugin have historically lived in **environment differences**, not logic — every field-reported failure came from a dimension the developer's own machine couldn't expose. Before tagging a release, vary the dimensions below, not just the code.

## The dimension checklist

| Dimension | Why it bites | Minimum check |
|---|---|---|
| **Claude Code version / namespace** | Plugin MCP servers register as `mcp__bland__*` on some versions and `mcp__plugin_norm_bland__*` on others; hardcoded refs silently pass on one and fail on the other | `/norm:smoke` on a machine with the LATEST Claude Code, installed from the real marketplace |
| **Install path / plugin id** | Zip or local-marketplace installs register under a different qualified id (`norm@bland-local`); anything hardcoding `norm@bland` silently resolves nothing | Install once from a zip mirror; `/norm:smoke` + `/norm:config` must still work |
| **Org / data shape** | A tool can pass on one org's calls and 404 on another's (field-reported: `get_call_log`) | Run `/norm:smoke` under a SECOND org's API key (test org), not just your own |
| **Server topology** | Single-instance dev servers cannot exhibit multi-instance state bugs (field-reported: the `-32000` session loss) | Server-side changes to `/v1/mcp` need the two-process round-robin A/B harness, not just localhost |
| **Server target** | localhost/tunnel and prod differ in deploy age, gating, and edge behavior | Smoke against BOTH prod and a dev target |
| **Working directory** | Hooks resolve state by walking up from the session's launch dir | Arm `/norm:loop` from a nested subdirectory once |
| **Write paths** | Reads exercise auth/transport; only writes exercise body forwarding per router (field-found: `/v1/automation` POST gap) | Each release, one reversible create→delete on a throwaway resource per newly-touched router |

## Release steps

1. Bump `plugins/norm/.claude-plugin/plugin.json` version + add a CHANGELOG entry (updates NO-OP without a version bump).
2. `node --check` every changed `bin/*.cjs`; frontmatter sanity on changed md files.
3. Secret sweep: `git diff --cached | grep -c <your-key-prefix>` must be 0. No internal hostnames/paths in plugin text.
4. Run **`/norm:smoke`** in your own session (fast regression floor).
5. Run **`/norm:smoke`** in ONE varied environment from the table (rotate the dimension each release; latest-CC + marketplace install is the highest-yield default).
6. Push, `claude plugin update norm@bland`, restart, spot-check the release's headline feature live.
7. Field reports (kal-style) are the outer QA loop: every report's findings either get fixed in the release or get a tracked item — no "noted" without an owner.

## Every "untested by design" needs an owner

If a release note or report says a surface is untested, that sentence must be accompanied by a tracked follow-up (Linear or the repo TODO). Disclaimers age into field bugs.
