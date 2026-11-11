#!/usr/bin/env node
// Bounded views of pinned run inputs and cached evidence; never assigns causes.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parseArgs } = require("node:util");

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const requireValue = (condition, message) => {
	if (!condition) throw new Error(message);
};

function workspacePath(root, base, value, allowMissing = false) {
	requireValue(
		typeof value === "string" &&
			value.length > 0 &&
			!value.includes("\\") &&
			!value.includes("\0") &&
			!value.split("/").includes(".."),
		"Invalid workspace path",
	);
	const file = path.resolve(base, value);
	const relative = path.relative(root, file);
	requireValue(
		relative !== ".." &&
			!relative.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relative),
		"Path outside workspace",
	);
	let current = root;
	for (const part of relative.split(path.sep).filter(Boolean)) {
		current = path.join(current, part);
		try {
			requireValue(
				!fs.lstatSync(current).isSymbolicLink(),
				"Symlink in workspace path",
			);
		} catch (error) {
			if (allowMissing && error.code === "ENOENT") return file;
			throw error;
		}
	}
	return file;
}

function checkedBytes(file, expected) {
	const raw = fs.readFileSync(file);
	requireValue(
		createHash("sha256").update(raw).digest("hex") === expected,
		`Source hash mismatch: ${file}`,
	);
	return raw;
}

function csvRecords(text) {
	const cell = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|$)/y;
	const records = [];
	let row = [];
	let offset = 0;
	while (offset < text.length) {
		cell.lastIndex = offset;
		const match = cell.exec(text);
		requireValue(match && cell.lastIndex > offset, "Malformed CSV");
		row.push(
			match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'),
		);
		offset = cell.lastIndex;
		if (match[3] === ",") continue;
		if (row.length > 1 || row[0] !== "") records.push(row);
		row = [];
	}
	if (row.length) records.push([...row, ""]);
	return records;
}

function csvRows(raw) {
	const [fields, ...records] = csvRecords(
		raw.toString("utf8").replace(/^\uFEFF/, ""),
	);
	requireValue(
		fields && new Set(fields).size === fields.length,
		"Missing or duplicate CSV headers",
	);
	return records.map((cells) => {
		requireValue(
			cells.length === fields.length,
			"CSV field count mismatch",
		);
		return Object.fromEntries(fields.map((name, i) => [name, cells[i]]));
	});
}

function nullableNumber(value) {
	if (value === undefined || value === null || value === "") return null;
	const number = Number(value);
	requireValue(Number.isFinite(number), "Invalid numeric score");
	return number;
}

function scoreRow(row, scorer) {
	const score = nullableNumber(row.bad_call_score);
	const threshold = nullableNumber(row.bad_call_threshold);
	const values = JSON.parse(row.scores);
	return {
		call_id: row.call_id,
		bad_call_score: score,
		threshold,
		flagged:
			score === null || threshold === null ? null : score >= threshold,
		scores: Object.fromEntries(
			scorer.definition.values.map((v) => [v.key, values[v.id] ?? null]),
		),
		scorer_answers: JSON.parse(row.answers).answers ?? {},
	};
}

function scopedRow(row, manifest, scorer) {
	requireValue(row, "Manifest call missing from CSV");
	const { scope } = manifest;
	requireValue(
		row.org_id === scope.org_id && row.agent_id === scope.agent_id,
		"Call outside manifest organization/agent",
	);
	requireValue(
		row.disposition_version_id === scorer.id,
		"Scoring definition version mismatch",
	);
	return {
		cohort: manifest.run_id,
		baseline_version: scope.baseline_version,
		...scoreRow(row, scorer),
	};
}

function loadManifest(file, root) {
	const manifest = readJSON(file);
	const directory = path.dirname(file);
	if (manifest.format === "sia-selection") {
		const runId = `${manifest.agentId}:${manifest.windowEnd}`;
		return {
			directory,
			manifest: {
				...manifest,
				run_id: runId,
				scope: {
					org_id: manifest.orgId,
					agent_id: manifest.agentId,
					baseline_version: null,
				},
			},
			rows: manifest.calls.map((call) => ({
				cohort: runId,
				call_id: call.callId,
				agent_version_id: call.agentVersionId,
				scoring_run_id: call.scoringRunId,
				disposition_version_id: call.dispositionVersionId,
				bad_call_score: null,
				threshold: null,
				flagged: null,
				scores: {},
				scorer_answers: {},
			})),
		};
	}
	const { batch } = manifest;
	const rows = csvRows(
		checkedBytes(
			workspacePath(root, directory, batch.source),
			batch.sha256,
		),
	);
	const byId = new Map(rows.map((row) => [row.call_id, row]));
	requireValue(byId.size === rows.length, "Duplicate CSV call IDs");
	requireValue(
		new Set(batch.call_ids).size === batch.call_ids.length &&
			batch.call_ids.length === batch.call_count,
		"Invalid manifest membership",
	);
	const reference = manifest.scoring_definitions;
	const scorer = JSON.parse(
		checkedBytes(
			workspacePath(root, directory, reference.source),
			reference.sha256,
		),
	);
	return {
		manifest,
		directory,
		rows: batch.call_ids.map((id) =>
			scopedRow(byId.get(id), manifest, scorer),
		),
	};
}

function unwrap(value) {
	while (value && Object.hasOwn(value, "data")) value = value.data;
	return value;
}

function dispositionView(run) {
	const names = new Map(run.values.map((value) => [value.id, value.key]));
	const values = Object.fromEntries(
		run.results.map((value) => {
			requireValue(
				names.has(value.valueId),
				"Unknown disposition value ID",
			);
			return [
				names.get(value.valueId),
				{ state: value.state, value: value.value ?? null },
			];
		}),
	);
	return {
		key: run.dispositionKey,
		version: run.versionNumber,
		status: run.status,
		values,
	};
}

function loadDispositions(file) {
	if (!fs.existsSync(file)) return null;
	const result = new Map();
	for (const run of unwrap(readJSON(file).response).runs) {
		if (run.dispositionKey === "bland_call_scoring") continue;
		const calls = result.get(run.callId) ?? [];
		calls.push(dispositionView(run));
		result.set(run.callId, calls);
	}
	return result;
}

function nodeIndex(value, pointer = "") {
	if (value === null || typeof value !== "object") return [];
	const found = [];
	if (
		Object.hasOwn(value, "id") &&
		Object.hasOwn(value, "type") &&
		Object.hasOwn(value, "data")
	) {
		found.push({
			pointer,
			id: value.id,
			type: value.type,
			name: value.data?.name ?? null,
		});
	}
	for (const [key, child] of Object.entries(value)) {
		const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
		found.push(...nodeIndex(child, `${pointer}/${escaped}`));
	}
	return found;
}

function pointerValue(value, pointer) {
	requireValue(
		pointer === "" || pointer.startsWith("/"),
		"JSON Pointer must start with /",
	);
	for (const part of pointer.split("/").slice(1)) {
		const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
		requireValue(
			value !== null &&
				typeof value === "object" &&
				Object.hasOwn(value, key),
			"JSON Pointer not found",
		);
		value = value[key];
	}
	return value;
}

function page(items, offset, limit) {
	const end = offset + limit;
	return {
		total: items.length,
		offset,
		next_offset: end < items.length ? end : null,
		items: items.slice(offset, end),
	};
}

class Batch {
	constructor(root, manifestPath) {
		this.root = fs.realpathSync(root);
		this.manifests = new Map();
		this.rows = new Map();
		requireValue(manifestPath, "--manifest is required");
		const paths = [manifestPath];
		for (const file of paths)
			this.addManifest(workspacePath(this.root, this.root, file));
		this.cacheRoot = path.join(this.root, "working/private/mcp-connection");
		const first = this.manifests.values().next().value;
		const evidence = first.manifest.evidence ?? {};
		this.cache = evidence.call_results
			? new Map(
					readJSON(
						workspacePath(
							this.root,
							this.root,
							evidence.call_results,
						),
					).results.map((item) => [item.call_id, item]),
				)
			: new Map();
		this.dispositions = loadDispositions(
			workspacePath(
				this.root,
				this.root,
				evidence.disposition_runs ??
					"working/private/evidence/dispositions/runs.json",
				true,
			),
		);
	}

	addManifest(file) {
		const loaded = loadManifest(file, this.root);
		requireValue(
			!this.manifests.has(loaded.manifest.run_id),
			"Duplicate cohort ID",
		);
		this.manifests.set(loaded.manifest.run_id, loaded);
		for (const row of loaded.rows) {
			requireValue(
				!this.rows.has(row.call_id),
				"Overlapping cohort membership",
			);
			this.rows.set(row.call_id, row);
		}
	}

	call(id) {
		requireValue(this.rows.has(id), "Call outside the supplied batch");
		const entry = this.cache.get(id);
		if (!entry) return null;
		const file = workspacePath(this.root, this.cacheRoot, entry.artifact);
		const relative = path.relative(this.root, file);
		requireValue(
			relative !== ".." &&
				!relative.startsWith(`..${path.sep}`) &&
				!path.isAbsolute(relative),
			"Cached call path outside workspace",
		);
		const result = JSON.parse(checkedBytes(file, entry.sha256));
		requireValue(result.data.id === id, "Cached call identity mismatch");
		return result;
	}

	row(id) {
		const { scorer_answers, ...row } = this.rows.get(id);
		const data = this.call(id)?.data;
		const summary = Array.from(data?.summary ?? "");
		return {
			...row,
			transcript_turns: data ? data.transcript.length : null,
			summary: summary.slice(0, 300).join(""),
			summary_truncated: summary.length > 300,
			dispositions:
				this.dispositions === null
					? { status: "not_fetched" }
					: this.dispositions.get(id) ?? {
							status: "no_returned_run",
						},
		};
	}

	snapshot(cohort) {
		requireValue(this.manifests.has(cohort), "Unknown cohort");
		const { manifest, directory } = this.manifests.get(cohort);
		const reference = manifest.agent_configuration;
		requireValue(
			reference,
			"No baseline snapshot was supplied with this selection manifest",
		);
		return JSON.parse(
			checkedBytes(
				workspacePath(this.root, directory, reference.source),
				reference.sha256,
			),
		);
	}

	summary() {
		const rows = [...this.rows.keys()].map((id) => this.row(id));
		return {
			calls: rows.length,
			flagged: rows.filter((row) => row.flagged === true).length,
			empty_transcripts: rows.filter((row) => row.transcript_turns === 0)
				.length,
			uncached_calls: rows.filter((row) => row.transcript_turns === null)
				.length,
			cohorts: Object.fromEntries(
				[...this.manifests.keys()].map((key) => [
					key,
					rows.filter((row) => row.cohort === key).length,
				]),
			),
			customer_dispositions:
				this.dispositions === null ? "not_fetched" : "cached",
			coverage: "Not assessed by this reader",
		};
	}
}

function callView(batch, args) {
	const cached = batch.call(args.callId);
	const scored = {
		...batch.row(args.callId),
		scorer_answers: batch.rows.get(args.callId).scorer_answers,
	};
	if (cached === null)
		return { ...scored, evidence_state: "not_cached" };
	const turns = cached.data.transcript;
	return {
		...scored,
		source: cached.source,
		evidence_state: turns.length
			? "nonempty_transcript"
			: "empty_transcript",
		...page(turns, args.offset, args.limit),
	};
}

function listView(batch, args) {
	if (args.cohort !== undefined)
		requireValue(batch.manifests.has(args.cohort), "Unknown cohort");
	const rows = [...batch.rows.values()].filter(
		(row) =>
			(args.cohort === undefined || row.cohort === args.cohort) &&
			(!args.flagged || row.flagged === true),
	);
	const result = page(rows, args.offset, args.limit);
	result.items = result.items.map((row) => batch.row(row.call_id));
	return result;
}

function configView(batch, args) {
	const snapshot = batch.snapshot(args.cohort);
	if (args.command === "nodes")
		return page(nodeIndex(snapshot), args.offset, args.limit);
	const value = pointerValue(snapshot, args.pointer);
	const text =
		typeof value === "string" ? value : JSON.stringify(value, null, 2);
	const { items, ...paging } = page(
		Array.from(text),
		args.offset,
		args.limit,
	);
	return {
		pointer: args.pointer,
		units: "characters",
		...paging,
		text: items.join(""),
	};
}

function pageArguments(command, values) {
	const defaults = {
		summary: 0,
		list: 10,
		call: 30,
		nodes: 20,
		config: 4000,
	};
	const offset = Number(values.offset ?? 0);
	const limit = Number(values.limit ?? defaults[command]);
	if (command !== "summary") {
		requireValue(
			Number.isInteger(offset) && offset >= 0,
			"offset must be nonnegative",
		);
		requireValue(
			Number.isInteger(limit) &&
				limit >= 1 &&
				limit <= (command === "config" ? 12000 : 100),
			"limit exceeds page budget",
		);
	}
	return { offset, limit };
}

function argumentsFor(argv) {
	const options = Object.fromEntries(
		["root", "manifest", "cohort", "pointer", "offset", "limit"].map(
			(name) => [name, { type: "string" }],
		),
	);
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			...options,
			flagged: { type: "boolean" },
			help: { type: "boolean" },
		},
	});
	if (values.help) return values;
	const [command, callId] = positionals;
	requireValue(
		["summary", "list", "call", "nodes", "config"].includes(command),
		"Expected summary, list, call, nodes or config",
	);
	requireValue(values.manifest, "--manifest is required");
	requireValue(
		positionals.length === (command === "call" ? 2 : 1),
		"Invalid command arguments",
	);
	if (["nodes", "config"].includes(command))
		requireValue(values.cohort, "--cohort is required");
	if (command === "config")
		requireValue(values.pointer !== undefined, "--pointer is required");
	return {
		...values,
		root: values.root ?? path.resolve(__dirname, ".."),
		command,
		callId,
		...pageArguments(command, values),
	};
}

function writePrivateView(root, value) {
	const text = `${JSON.stringify(value, null, 2)}\n`;
	const directory = workspacePath(
		root,
		root,
		"working/private/inspection-output",
		true,
	);
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	workspacePath(root, root, directory);
	const output = fs.mkdtempSync(path.join(directory, "view-"));
	const file = path.join(output, "result.json");
	fs.writeFileSync(file, text, { flag: "wx", mode: 0o600 });
	return { path: path.relative(root, file), bytes: Buffer.byteLength(text) };
}

function main() {
	let args;
	try {
		args = argumentsFor(process.argv.slice(2));
	} catch (error) {
		error.exitCode = 2;
		throw error;
	}
	if (args.help) {
		process.stdout.write(
			"node scripts/inspect-run.cjs [--root DIR] --manifest FILE summary|list|call ID|nodes|config\nOptions: --cohort ID --pointer JSON_POINTER --flagged --offset N --limit N\nResults are saved privately; stdout contains only the artifact path and byte count.\n",
		);
		return;
	}
	const views = {
		summary: (b) => b.summary(),
		list: listView,
		call: callView,
		nodes: configView,
		config: configView,
	};
	const root = fs.realpathSync(args.root);
	try {
		const batch = new Batch(root, args.manifest);
		const receipt = writePrivateView(
			root,
			views[args.command](batch, args),
		);
		process.stdout.write(`${JSON.stringify(receipt)}\n`);
	} catch (error) {
		const receipt = writePrivateView(root, {
			error: error.message,
			stack: error.stack,
		});
		process.stderr.write(
			`${JSON.stringify({ error: "Run inspection failed", ...receipt })}\n`,
		);
		process.exitCode = 1;
	}
}

try {
	main();
} catch (error) {
	process.stderr.write(
		"Run inspection failed; check arguments and private input files.\n",
	);
	process.exitCode = error.exitCode ?? 1;
}
