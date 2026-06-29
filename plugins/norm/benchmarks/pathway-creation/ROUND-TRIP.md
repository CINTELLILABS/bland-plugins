# Round-Trip Contract: Fixture → Parser → Compile

This benchmark's fixtures are written in the **canonical pathway file layout** — the exact
file set emitted by the engine generator
(`apps/api/src/lib/blandcode/engine/generator.ts`). The fixtures are the inverse of what
`generateFiles()` produces, so they must survive a full round trip through the engine with
**zero dropped files and a clean validate**.

## Canonical layout

```
nodes/<slug>/node.md          # YAML frontmatter (id, type, name, [isStart]) + body = node prompt
nodes/<slug>/condition.md     # optional — routing condition for the node's outgoing transition
nodes/<slug>/variables.yaml   # optional — { variables: [{ name, type, description }] }
nodes/<slug>/model.yaml       # optional — modelOptions map
nodes/<slug>/tools.yaml       # optional — { tools: [...] } attached to the node
nodes/<slug>/unit-tests.yaml  # optional — per-node test scenario
nodes/<slug>/tag.yaml         # optional — { name, color }
edges/<srcSlug>-to-<tgtSlug>.md   # frontmatter (id, source, target, sourceName, targetName) + body = label
.pathways/global_prompt.md    # raw markdown, NO frontmatter — the global/system prompt
.pathways/layout.yaml         # { positions: { <slug>: { x, y } } }
.pathways/config.yaml         # reserved; emitted as `{}`
```

- **`slug` = first 8 hex chars of the node's UUID `id`** (`id.replace(/-/g,"").slice(0,8)`).
  The slug is stable across renames and is what `edges/*`, `layout.yaml`, and the live
  manifest reference. The `id` frontmatter is the full UUID.
- **No `manifest.yaml` on disk.** The manifest is rebuilt live from the node/edge files at
  compile time (`buildLiveManifest()` scans `nodes/<slug>/node.md` + `edges/*.md`). A static
  manifest would only go stale, so the canonical layout omits it.
- **`.pathways/global_prompt.md` has no frontmatter.** The exporter reads it as plain text
  (`fileMap.get(".pathways/global_prompt.md")`), so adding `---` delimiters would corrupt it.

## The round trip

```
fixture files ──parser.ts──▶ ParsedFile { frontmatter, body }
              ──exporter.ts─▶ { nodes: FrontendNode[], edges: FrontendEdge[] }
              ──generator.ts▶ files  (must equal the fixture, modulo YAML formatting)
              ──compile──────▶ validate: clean
```

Each mapping the parser/exporter performs (`exporter.ts`):

| Fixture file                  | Exported into                                         |
|-------------------------------|-------------------------------------------------------|
| `node.md` frontmatter         | `node.id`, `node.type`, `data.name`, `data.isStart`   |
| `node.md` body                | `data.prompt`                                          |
| `condition.md` body           | `data.condition`                                       |
| `variables.yaml`              | `data.extractVars` (tuples)                           |
| `tools.yaml`                  | `data.tools`                                           |
| `unit-tests.yaml`             | `data.unitTests`                                       |
| `edges/*.md` frontmatter+body | `edge.source`/`edge.target` (via slug→id) + `data.label` |
| `.pathways/global_prompt.md`  | `globalConfig.globalPrompt`                           |
| `.pathways/layout.yaml`       | `node.position`                                       |

## Expectations the fixture must satisfy

1. **Zero dropped files.** Every node has a `node.md`; every edge endpoint slug resolves to
   an existing node slug; every `layout.yaml` key is a real node slug. Nothing the parser
   reads is orphaned, and nothing it needs is missing.
2. **Exactly one start node** (`isStart: true`).
3. **Slug integrity.** For every node, `id.replace(/-/g,"").slice(0,8) === slug` and the
   `nodes/<slug>/` directory name. Edge filenames are `<srcSlug>-to-<tgtSlug>.md` and their
   `source`/`target` frontmatter match.
4. **Full reachability.** Every node is reachable from the start node by following edges.
5. **Clean validate / compile.** The reconstructed `{ nodes, edges }` compiles with no
   validation errors (Layer 2 `compile.ts`).

### YAML scalar gotcha (load-bearing)

A slug that matches scientific-notation float syntax — `<digits>e<digits>`, e.g. `631e5943`
— is coerced to a number (`Infinity`) by the YAML parser when written as a **bare scalar**.
The engine's `yaml.stringify` quotes such values automatically; hand-authored fixtures must
do the same. Quote the slug wherever it appears as a YAML scalar value or map key:
`edges/*.md` `source`/`target`, `layout.yaml` keys, and `unit-tests.yaml` path lists. Slugs
embedded only in a hyphenated UUID `id` (e.g. `631e5943-3c0e-...`) are safe — the hyphen
makes them strings.

## Scoring

`scripts/score-workspace.mjs` scores a workspace against `rubric.json` using this same
canonical layout: it globs `nodes/*/node.md`, `edges/*.md`, `nodes/*/variables.yaml`, and
`nodes/*/unit-tests.yaml`, measures prompt depth from each `node.md` body, and has **no**
`manifest_present` check. Run it against this fixture:

```
node scripts/score-workspace.mjs \
  --workspace benchmarks/pathway-creation/fixtures/passing-appointment \
  --task appointment-booking-agent
```

The `passing-appointment` fixture scores **100/100, passed: true** — it is the reference for
what a clean round trip plus a clean validate looks like.
