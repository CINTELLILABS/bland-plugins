#!/usr/bin/env node
// Bundle the REAL Bland pathway engine (server's generator + exporter) into
// bin/engine.bundle.cjs so the plugin's codec is byte-identical to the server —
// no client-side reimplementation, no drift.
//
// Re-run this whenever the server engine changes (generator.ts / exporter.ts /
// parser.ts / manifest.ts). Point ENGINE_DIR at a checkout of the server repo.
//
//   node scripts/bundle-engine.mjs [path-to-apps/api/src/lib/blandcode]
//
// The two impure imports in exporter.ts (NodeTypeSchema from ../models, bclog
// from ../framework/logger) are stubbed: NodeTypeSchema is only used for a
// NON-FATAL "unrecognized type" warning and bclog only logs — neither changes
// the emitted JSON, so a permissive schema + no-op logger preserve fidelity
// while keeping the bundle free of jsonpath/feature-flag/datadog deps.

import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const DEFAULT_ENGINE_DIR =
	"/Users/blandai/Documents/blandai_src/SERVER/.claude/worktrees/awl-core-impl/apps/api/src/lib/blandcode";
const ENGINE_DIR = process.argv[2] || DEFAULT_ENGINE_DIR;
const ENGINE_SUBDIR = path.join(ENGINE_DIR, "engine");
const OUT = path.join(import.meta.dirname, "..", "bin", "engine.bundle.cjs");

if (!existsSync(path.join(ENGINE_SUBDIR, "generator.ts"))) {
	console.error(`engine not found at: ${ENGINE_SUBDIR}\nPass the path to apps/api/src/lib/blandcode as arg 1.`);
	process.exit(1);
}

// esbuild lives in the SERVER repo's node_modules (the plugin has none), so
// resolve it from the engine source tree rather than from this script's dir.
const require = createRequire(path.join(ENGINE_SUBDIR, "generator.ts"));
const esbuild = require("esbuild");

// The bundle entry is inlined here (via stdin) so nothing extra has to live in
// the server repo. Only the pure conversion (generator + exporter) is exposed.
const ENTRY_CONTENTS = `
export { generateFiles } from "./generator";
export { exportToJSON } from "./exporter";
`;

const stubImpure = {
	name: "stub-impure",
	setup(build) {
		build.onResolve({ filter: /(^|\/)framework\/logger$/ }, () => ({
			path: "stub:logger",
			namespace: "norm-stub",
		}));
		build.onResolve({ filter: /(^|\/)blandcode\/models$|(^|\/)\.\.\/models$/ }, () => ({
			path: "stub:models",
			namespace: "norm-stub",
		}));
		build.onLoad({ filter: /.*/, namespace: "norm-stub" }, (args) => {
			if (args.path === "stub:logger") {
				return {
					contents: "export function bclog(){} export function bcerr(){} export function bcwarn(){}",
					loader: "js",
				};
			}
			// Permissive NodeTypeSchema: exporter only uses it for a non-fatal
			// "unrecognized type" warning; the node's type is preserved regardless.
			// resolveDir lets esbuild find @sinclair/typebox in the server repo.
			return {
				contents:
					"import { Type } from '@sinclair/typebox'; export const NodeTypeSchema = Type.Any();",
				loader: "ts",
				resolveDir: ENGINE_DIR,
			};
		});
	},
};

await esbuild.build({
	stdin: {
		contents: ENTRY_CONTENTS,
		resolveDir: ENGINE_SUBDIR,
		loader: "ts",
	},
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node18",
	outfile: OUT,
	plugins: [stubImpure],
	logLevel: "warning",
});

console.log(`bundled engine -> ${OUT}`);
