#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — PostToolUse hook (offline frontmatter/edge lint).
 *
 * Runs after Write/Edit/MultiEdit. It is a NO-OP unless the edited file lives
 * inside a pathway workspace (a directory tree containing a `.pathways/` dir,
 * with the file under `nodes/`, `edges/`, or `.pathways/`). For pathway files it
 * does cheap, offline structural checks and surfaces advisory notes:
 *
 *   - node.md      : must have YAML frontmatter with id/type/name; flags missing
 *                    fields and reminds about exactly-one isStart.
 *   - condition.md : reminds that the body is the routing condition (no schema).
 *   - edges/*.md   : must have frontmatter with id/source/target; warns if the
 *                    filename `<src>-to-<tgt>.md` doesn't match source/target.
 *   - global_prompt.md : must NOT have frontmatter (--- delimiters corrupt it).
 *   - *.yaml        : reminds that structured YAML is hand-edited but must stay parseable,
 *                     and flags `<digits>e<digits>` slugs used as bare (unquoted) scalars.
 *
 * OFFLINE (no network, no secrets). FAIL-SOFT: every error is swallowed and the
 * process always exits 0 so a lint problem can never block the session.
 *
 * Reads the PostToolUse payload as JSON from stdin to discover the edited path.
 */

const fs = require("node:fs");
const path = require("node:path");

function readStdin() {
	return new Promise((resolve) => {
		let buffer = "";
		const timer = setTimeout(() => resolve(buffer), 250);
		if (timer.unref) timer.unref();
		try {
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (chunk) => {
				buffer += chunk;
			});
			process.stdin.on("end", () => {
				clearTimeout(timer);
				resolve(buffer);
			});
			process.stdin.on("error", () => {
				clearTimeout(timer);
				resolve(buffer);
			});
		} catch {
			clearTimeout(timer);
			resolve(buffer);
		}
	});
}

function extractEditedPath(payload) {
	const ti = payload && payload.tool_input ? payload.tool_input : {};
	// Write/Edit use file_path; MultiEdit also uses file_path with an edits array.
	const candidate = ti.file_path || ti.filePath || ti.path || "";
	return typeof candidate === "string" ? candidate : "";
}

function findWorkspaceRoot(filePath) {
	let dir = path.dirname(path.resolve(filePath));
	for (let i = 0; i < 12; i += 1) {
		try {
			if (fs.existsSync(path.join(dir, ".pathways"))) return dir;
		} catch {
			/* ignore */
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function readFrontmatter(text) {
	// Returns { has, fields:Set<string>, raw } — does not require a YAML parser.
	if (!text.startsWith("---")) return { has: false, fields: new Set(), raw: "" };
	const end = text.indexOf("\n---", 3);
	if (end < 0) return { has: false, fields: new Set(), raw: "" };
	const raw = text.slice(text.indexOf("\n") + 1, end);
	const fields = new Set();
	for (const line of raw.split("\n")) {
		const m = /^([A-Za-z0-9_]+)\s*:/.exec(line);
		if (m) fields.add(m[1]);
	}
	return { has: true, fields, raw };
}

function lintPathwayFile(workspaceRoot, filePath) {
	const notes = [];
	const rel = path.relative(workspaceRoot, path.resolve(filePath));
	const base = path.basename(filePath);
	let text = "";
	try {
		text = fs.readFileSync(filePath, "utf8");
	} catch {
		return notes; // file may have been deleted; nothing to lint
	}

	const inNodes = rel.split(path.sep)[0] === "nodes";
	const inEdges = rel.split(path.sep)[0] === "edges";
	const inPathways = rel.split(path.sep)[0] === ".pathways";

	if (inNodes && base === "node.md") {
		const fm = readFrontmatter(text);
		if (!fm.has) {
			notes.push(`${rel}: node.md is missing YAML frontmatter (needs id, type, name).`);
		} else {
			for (const required of ["id", "type", "name"]) {
				if (!fm.fields.has(required)) {
					notes.push(`${rel}: node.md frontmatter is missing \`${required}\`.`);
				}
			}
			notes.push(
				`${rel}: a pathway needs exactly one start node (\`isStart: true\`). Confirm only one node.md sets it.`,
			);
		}
	} else if (inNodes && base === "condition.md") {
		notes.push(`${rel}: condition.md body is the routing condition (prose, no frontmatter schema).`);
	} else if (inEdges && base.endsWith(".md")) {
		const fm = readFrontmatter(text);
		if (!fm.has) {
			notes.push(`${rel}: edge file is missing frontmatter (needs id, source, target).`);
		} else {
			for (const required of ["id", "source", "target"]) {
				if (!fm.fields.has(required)) {
					notes.push(`${rel}: edge frontmatter is missing \`${required}\`.`);
				}
			}
			// Filename convention: <srcSlug>-to-<tgtSlug>.md
			const nameMatch = /^(.+?)-to-(.+)\.md$/.exec(base);
			if (!nameMatch) {
				notes.push(`${rel}: edge filename should be \`<srcSlug>-to-<tgtSlug>.md\`.`);
			} else {
				const sourceLine = /^\s*source\s*:\s*["']?([^"'\n]+)["']?\s*$/m.exec(fm.raw);
				const targetLine = /^\s*target\s*:\s*["']?([^"'\n]+)["']?\s*$/m.exec(fm.raw);
				if (sourceLine && !nameMatch[1].includes(String(sourceLine[1]).trim().slice(0, 8))) {
					notes.push(`${rel}: edge filename source segment doesn't match \`source\` frontmatter.`);
				}
				if (targetLine && !nameMatch[2].includes(String(targetLine[1]).trim().slice(0, 8))) {
					notes.push(`${rel}: edge filename target segment doesn't match \`target\` frontmatter.`);
				}
			}
		}
	} else if (inPathways && base === "global_prompt.md") {
		if (text.startsWith("---")) {
			notes.push(
				`${rel}: global_prompt.md must NOT have frontmatter — leading \`---\` delimiters corrupt it. Use plain markdown.`,
			);
		}
	} else if (inPathways && base === "layout.yaml") {
		notes.push(`${rel}: layout.yaml is auto-derived — do not hand-edit node positions.`);
	} else if (base.endsWith(".yaml") && inNodes) {
		notes.push(
			`${rel}: structured YAML — the file IS the edit surface. Keep the JSON-inlined frontmatter parseable, quote <digits>e<digits> slugs, check the shape with get_pathway_schema when unsure, and run /norm:validate before commit.`,
		);
		// `<digits>e<digits>` bare scalar gets coerced to a number by YAML.
		const lines = text.split("\n");
		for (let i = 0; i < lines.length; i += 1) {
			const m = /:\s*([0-9]+e[0-9]+)\s*$/.exec(lines[i]);
			const keyM = /^\s*([0-9]+e[0-9]+)\s*:/.exec(lines[i]);
			if (m) {
				notes.push(`${rel}:${i + 1}: slug \`${m[1]}\` looks like a number — quote it ("${m[1]}").`);
			} else if (keyM) {
				notes.push(`${rel}:${i + 1}: slug key \`${keyM[1]}\` looks like a number — quote it ("${keyM[1]}").`);
			}
		}
	}

	return notes;
}

async function main() {
	let payload = {};
	try {
		const raw = await readStdin();
		if (raw && raw.trim()) payload = JSON.parse(raw);
	} catch {
		return; // can't parse payload — fail soft, no-op
	}

	let editedPath = "";
	try {
		editedPath = extractEditedPath(payload);
	} catch {
		return;
	}
	if (!editedPath) return; // nothing to lint

	let workspaceRoot = null;
	try {
		workspaceRoot = findWorkspaceRoot(editedPath);
	} catch {
		return;
	}
	if (!workspaceRoot) return; // outside a pathway workspace -> no-op

	let notes = [];
	try {
		notes = lintPathwayFile(workspaceRoot, editedPath);
	} catch {
		return; // fail soft
	}
	if (!notes.length) return; // clean -> stay quiet

	const context = ["Bland Norm lint (advisory, non-blocking):", ...notes.map((n) => `- ${n}`)].join("\n");
	try {
		process.stdout.write(
			`${JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PostToolUse",
					additionalContext: context,
				},
			})}\n`,
		);
	} catch {
		/* fail soft */
	}
}

main()
	.catch(() => {
		/* fail soft — never throw */
	})
	.finally(() => {
		process.exit(0);
	});
