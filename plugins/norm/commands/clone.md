---
description: Clone a Bland pathway into a local workspace of files (or scaffold a brand-new one). Usage — /norm:clone <pathway_id|new>
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Glob"
---

# Clone Bland Pathway

Check out a pathway from the live Bland server into the canonical local workspace, or scaffold a new empty pathway.

Argument: `$ARGUMENTS` — either an existing `pathway_id`, or `new <name>` to begin a fresh pathway.

Steps:

1. Run the sync engine and read its JSON stdout. The engine pulls the pathway into `pathway/` and snapshots a baseline:

   - To check out an existing pathway by id:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs" clone <pathway_id>
     ```

   - To scaffold a new pathway (when `$ARGUMENTS` begins with `new`), pass the desired name with `--new`:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs" clone --new "<name>"
     ```

   Map `$ARGUMENTS` to one of these two forms: a bare id → `clone <id>`; `new ...` → `clone --new "<name>"`.

2. Interpret the JSON result:
   - `ok: true` → report `pathway_id`, `version_id`, the workspace `path`, and the number of files written. List the start node and node count if present.
   - `ok: false` → surface `error` plainly. If it indicates the pathway id is unknown or auth failed, say exactly that and stop; do not invent a workspace.
3. Do NOT hand-edit any structured YAML or `.pathways/layout.yaml` after cloning. Prose files (`node.md`, `condition.md`, edge labels, `.pathways/global_prompt.md`) are the editable surface.
4. If the result reports the local workspace already exists and is dirty, warn the user before overwriting — do not silently clobber in-progress edits.

After a clean clone, the workspace is ready for prose edits and `set_*` structured edits, then `/norm:validate` and `/norm:commit`.
