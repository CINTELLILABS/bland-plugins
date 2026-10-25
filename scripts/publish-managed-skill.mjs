#!/usr/bin/env node
/**
 * Publish the v2 norm plugin as the `norm-migrate` Anthropic custom skill.
 *
 * This is how the doctrine reaches Bland's managed migration sessions:
 * Anthropic's Skills API stores and versions the bundle and mounts it into
 * every session; the SERVER references the skill at version "latest", so a
 * merge here reaches the next migration with no SERVER deploy.
 *
 * Bundle mapping (keep in sync with SERVER's
 * apps/api/src/lib/agents/migration/pluginArchive.ts buildSkillFiles, the
 * one-time bootstrap copy of this packaging):
 *   - SKILL.md            = commands/migrate.md with skill frontmatter
 *                           (name + description), body verbatim
 *   - skills/**, bin/**, commands/** ride along at plugin-relative paths
 *   - nested SKILL.md files are stored as GUIDE.md (the Skills API allows
 *     exactly one SKILL.md per bundle); content verbatim
 *   - plugin-version.json = .claude-plugin/plugin.json (traceability)
 *
 * Usage: ANTHROPIC_API_KEY=... node scripts/publish-managed-skill.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SKILL_NAME = "norm-migrate";
const PLUGIN_ROOT = new URL("../v2/", import.meta.url).pathname;
const API = "https://api.anthropic.com";
const SUBTREES = ["skills", "bin", "commands"];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
	console.error("ANTHROPIC_API_KEY is required");
	process.exit(1);
}

async function walk(dir, rel = "") {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const abs = path.join(dir, entry.name);
		const relPath = rel ? `${rel}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...(await walk(abs, relPath)));
		else if (entry.isFile()) out.push([relPath, await readFile(abs)]);
	}
	return out;
}

function frontmatterDescription(markdown) {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
	const line = match?.[1]
		.split("\n")
		.find((entry) => entry.startsWith("description:"));
	return line ? line.slice("description:".length).trim() : null;
}

async function buildBundle() {
	const migrate = await readFile(
		path.join(PLUGIN_ROOT, "commands", "migrate.md"),
		"utf8",
	);
	const manifest = JSON.parse(
		await readFile(
			path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"),
			"utf8",
		),
	);
	const description =
		frontmatterDescription(migrate) ??
		"Migrate a Bland v1 pathway or persona into a v2 agent with the full hand-migration doctrine.";
	const skillMd = [
		"---",
		`name: ${SKILL_NAME}`,
		`description: ${description}`,
		"---",
		"",
		migrate.replace(/^---\n[\s\S]*?\n---\n/, "").trimStart(),
		"",
		"> Packaging note: the Skills API allows one SKILL.md per bundle, so each",
		"> bundled sub-skill lives at `skills/<name>/GUIDE.md` (verbatim content of",
		"> the plugin's `skills/<name>/SKILL.md`).",
	].join("\n");

	const files = [
		[`${SKILL_NAME}/SKILL.md`, Buffer.from(skillMd)],
		[
			`${SKILL_NAME}/plugin-version.json`,
			Buffer.from(JSON.stringify(manifest, null, 2)),
		],
	];
	for (const subtree of SUBTREES) {
		for (const [rel, content] of await walk(
			path.join(PLUGIN_ROOT, subtree),
			subtree,
		)) {
			const bundled = rel.endsWith("/SKILL.md")
				? rel.replace(/\/SKILL\.md$/, "/GUIDE.md")
				: rel;
			files.push([`${SKILL_NAME}/${bundled}`, content]);
		}
	}
	return { files, version: manifest.version ?? "?" };
}

function formData(files) {
	const form = new FormData();
	for (const [name, content] of files) {
		form.append("files[]", new Blob([content]), name);
	}
	return form;
}

async function anthropic(pathname, init = {}) {
	const response = await fetch(`${API}${pathname}`, {
		...init,
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-beta": "skills-2025-10-02",
			...(init.headers ?? {}),
		},
	});
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(
			`${init.method ?? "GET"} ${pathname} -> ${response.status}: ${JSON.stringify(body).slice(0, 300)}`,
		);
	}
	return body;
}

async function findSkill() {
	let page = await anthropic(`/v1/skills?limit=100`);
	for (;;) {
		for (const skill of page.data ?? []) {
			// Live API returns display_title; older shapes say display_name.
			if ((skill.display_title ?? skill.display_name) === SKILL_NAME)
				return skill;
		}
		if (!page.next_page) return null;
		page = await anthropic(
			`/v1/skills?limit=100&page=${encodeURIComponent(page.next_page)}`,
		);
	}
}

const { files, version } = await buildBundle();
console.log(`bundle: ${files.length} files, plugin version ${version}`);
const existing = await findSkill();
if (existing) {
	const created = await anthropic(`/v1/skills/${existing.id}/versions`, {
		method: "POST",
		body: formData(files),
	});
	console.log(
		`published version ${created.version ?? created.id ?? "?"} of skill ${existing.id}`,
	);
} else {
	const created = await anthropic(`/v1/skills`, {
		method: "POST",
		body: formData(files),
	});
	console.log(`created skill ${created.id} (latest ${created.latest_version_id})`);
}
