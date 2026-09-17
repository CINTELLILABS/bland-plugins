#!/usr/bin/env node
"use strict";

/**
 * Norm v2 — deterministic migration audit: snapshot structure + routing-crash
 * checks + byte-level parity against the v1 source export(s). This is the
 * machine half of /norm:validate — no model judgment anywhere. Prints a JSON
 * verdict {passed, checks: [{id, name, passed, detail}]} and exits 0 (exit 2
 * only on crash/unreadable input).
 *
 * Usage:
 *   norm-migrate-audit.cjs --snapshot snap.json [--source v1.json]... \
 *     [--persona persona.json] [--allow-missing-fallback <routeName>]... [--json]
 */

const fs = require("node:fs");

const args = process.argv.slice(2);
function flagAll(name) {
	const out = [];
	for (let i = 0; i < args.length; i += 1) {
		if (args[i] === `--${name}` && args[i + 1]) out.push(args[i + 1]);
	}
	return out;
}
const snapshotPath = flagAll("snapshot")[0];
const sourcePaths = flagAll("source");
const personaPath = flagAll("persona")[0];
const allowedMissingFallback = new Set(flagAll("allow-missing-fallback"));

const checks = [];
function check(id, name, passed, detail) {
	checks.push({ id, name, passed: Boolean(passed), detail: detail || "" });
}

function loadJson(p) {
	const raw = JSON.parse(fs.readFileSync(p, "utf8"));
	return raw && raw.data && typeof raw.data === "object" ? raw.data : raw;
}

function main() {
	if (!snapshotPath) {
		process.stdout.write(JSON.stringify({ passed: false, error: "--snapshot required" }));
		process.exitCode = 2;
		return;
	}
	const snap = loadJson(snapshotPath);
	const snapText = JSON.stringify(snap);
	const behavior = snap.behavior || {};
	const nodes = Array.isArray(behavior.nodes) ? behavior.nodes : [];
	const edges = Array.isArray(behavior.edges) ? behavior.edges : [];

	// ── Structure ──
	check("S1", "top-level shape", nodes.length > 0 && edges.length >= 0 && typeof (snap.settings || {}).systemPrompt === "string" && snap.settings.systemPrompt.length > 0, "behavior.nodes + settings.systemPrompt");
	const inbound = nodes.filter((n) => n.type === "inbound");
	const hubs = nodes.filter((n) => n.type === "agent");
	const inboundEdge = edges.find((e) => e.source === "inbound" || (inbound[0] && e.source === inbound[0].id));
	check("S2", "one inbound + one hub + inbound edge", inbound.length === 1 && hubs.length === 1 && Boolean(inboundEdge), `inbound=${inbound.length} hub=${hubs.length} edge=${Boolean(inboundEdge)}`);
	const scenarios = nodes.filter((n) => n.type === "complex-scenario");
	let entryOk = true;
	let pillOk = true;
	const flowIssues = [];
	for (const s of scenarios) {
		const d = s.data || {};
		if (!d.entry || !String(d.entry.description || "").trim()) {
			entryOk = false;
			flowIssues.push(`${d.name || s.id}: empty entry.description`);
		}
		const fn = ((d.flow || {}).nodes || []);
		if (!fn.length || fn[0].type !== "start" || fn[fn.length - 1].type !== "end") {
			pillOk = false;
			flowIssues.push(`${d.name || s.id}: missing start/end pills`);
		}
	}
	check("S3", "scenario entries + start/end pills", entryOk && pillOk, flowIssues.join("; "));

	const ids = new Map();
	const dupes = [];
	(function walk(o) {
		if (Array.isArray(o)) return o.forEach(walk);
		if (o && typeof o === "object") {
			if (typeof o.id === "string" && o.id) {
				ids.set(o.id, (ids.get(o.id) || 0) + 1);
				if (ids.get(o.id) === 2) dupes.push(o.id);
			}
			Object.values(o).forEach(walk);
		}
	})(behavior);
	check("S4", "no duplicate ids", dupes.length === 0, dupes.slice(0, 5).join(", "));

	const targetIssues = [];
	const routeNoFallback = [];
	const orCollapse = [];
	const unreachable = [];
	const mergedLabels = [];
	for (const s of scenarios) {
		const d = s.data || {};
		const fn = ((d.flow || {}).nodes || []);
		const fe = ((d.flow || {}).edges || []);
		const idset = new Set(fn.map((n) => n.id));
		const endPill = fn.length ? fn[fn.length - 1].id : "";
		const inboundTargets = new Set(fe.map((e) => e.target));
		for (const e of fe) {
			if (!idset.has(e.source) || !idset.has(e.target)) targetIssues.push(`${d.name}: edge ${String(e.id).slice(0, 8)} dangling`);
			const lbl = String(((e.data || {}).label) || "");
			if (e.target === endPill && lbl.includes(" / ")) mergedLabels.push(`${d.name}: "${lbl}"`);
		}
		for (const n of fn) {
			const nd = n.data || {};
			if (n.type === "route") {
				for (const r of nd.rules || []) {
					if (r.targetNodeId && !idset.has(r.targetNodeId)) targetIssues.push(`${d.name}/${nd.name}: rule target missing`);
					inboundTargets.add(r.targetNodeId);
					const byField = new Map();
					for (const c of r.conditions || []) {
						if (["equals", "is"].includes(String(c.operator))) {
							const arr = byField.get(c.field) || [];
							arr.push(String(c.value));
							byField.set(c.field, arr);
						}
					}
					for (const [f, vals] of byField) {
						if (new Set(vals).size > 1) orCollapse.push(`${d.name}/${nd.name}: ANDs ${f}=${vals.join(",")}`);
					}
				}
				if (nd.fallbackNodeId) {
					if (!idset.has(nd.fallbackNodeId)) targetIssues.push(`${d.name}/${nd.name}: fallback missing`);
					inboundTargets.add(nd.fallbackNodeId);
				} else if (!allowedMissingFallback.has(String(nd.name))) {
					routeNoFallback.push(`${d.name}/${nd.name}`);
				}
			}
			for (const t of nd.tools || []) {
				for (const rp of t.responsePathways || []) {
					const tgt = rp.targetId || rp.targetNodeId;
					if (tgt && !idset.has(tgt)) targetIssues.push(`${d.name}/${nd.name}: tool rp target missing`);
					if (tgt) inboundTargets.add(tgt);
				}
			}
			for (const rp of nd.responsePathways || []) {
				// webhook/tool STEP rows use targetNodeId; attached-tool rows use targetId
				const tgt = rp.targetNodeId || rp.targetId;
				if (tgt && !idset.has(tgt)) targetIssues.push(`${d.name}/${nd.name}: rp target missing`);
				if (tgt) inboundTargets.add(tgt);
			}
		}
		for (let i = 1; i < fn.length - 1; i += 1) {
			if (!inboundTargets.has(fn[i].id) && i !== 1) unreachable.push(`${d.name}/${(fn[i].data || {}).name || fn[i].id}`);
		}
	}
	check("S5", "all targets resolve", targetIssues.length === 0, targetIssues.slice(0, 5).join("; "));
	check("S6", "root end-call exists", nodes.some((n) => n.type === "end-call"), "");
	check("S7", "contact.inboundNumbers is an array", Array.isArray((snap.contact || {}).inboundNumbers), "the platform validator rejects a snapshot without it");
	{
		const badHeaders = [];
		for (const s of scenarios) {
			for (const fn of ((s.data || {}).flow || {}).nodes || []) {
				if (fn.type === "webhook") {
					const hs = (fn.data || {}).headers;
					if (Array.isArray(hs) && hs.some((h) => Array.isArray(h) || !h || typeof h.key !== "string")) {
						badHeaders.push(`${(s.data || {}).name}/${(fn.data || {}).name}`);
					}
				}
			}
		}
		check("S8", "webhook headers are {key,value} rows (not v1 tuples)", badHeaders.length === 0, badHeaders.join(", "));
	}
	check("R1", "route fallbacks present", routeNoFallback.length === 0, routeNoFallback.join(", "));
	check("R2", "no OR-collapse", orCollapse.length === 0, orCollapse.slice(0, 5).join("; "));
	check("R3", "flow steps reachable", unreachable.length === 0, unreachable.slice(0, 6).join(", "));
	check("R4", "no merged exit labels", mergedLabels.length === 0, mergedLabels.slice(0, 4).join("; "));

	// ── Parity vs v1 source(s) — SHAPE-ANCHORED, not substring greps ──
	// Collect what the snapshot actually carries, field-by-field: snippet
	// (id, version) PAIRS wherever they appear, webhook-step URLs, transfer-step
	// numbers, customCode-step pin pairs. A swapped version between two
	// snippets, or a URL that only appears in prose, cannot pass.
	const snapPinPairs = new Set();
	const snapCodeStepPairs = new Set();
	const snapWebhookUrls = new Set();
	const snapTransferNumbers = new Set();
	(function collect(o) {
		if (Array.isArray(o)) return o.forEach(collect);
		if (!o || typeof o !== "object") return;
		if (typeof o.snippet_id === "string") snapPinPairs.add(`${o.snippet_id}@${o.snippet_version ?? ""}`);
		if (typeof o.snippetId === "string") {
			snapPinPairs.add(`${o.snippetId}@${o.snippetVersion ?? ""}`);
			snapCodeStepPairs.add(`${o.snippetId}@${o.snippetVersion ?? ""}`);
		}
		if (o.type === "webhook" && o.data && typeof o.data.url === "string") snapWebhookUrls.add(o.data.url);
		if (o.type === "transfer" && o.data && typeof o.data.transferNumber === "string") snapTransferNumbers.add(o.data.transferNumber);
		Object.values(o).forEach(collect);
	})(snap);

	const missingPins = [];
	const missingTools = [];
	const missingNumbers = [];
	const missingUrls = [];
	const codeToolsAsTools = [];
	let promptContained = true;
	let promptDetail = "";
	for (const sp of sourcePaths) {
		const src = loadJson(sp);
		const srcText = JSON.stringify(src);
		// source pin PAIRS (id + pinned version together)
		(function collectSrc(o) {
			if (Array.isArray(o)) return o.forEach(collectSrc);
			if (!o || typeof o !== "object") return;
			if (typeof o.snippet_id === "string") {
				const pair = `${o.snippet_id}@${o.snippet_version ?? ""}`;
				if (!snapPinPairs.has(pair)) missingPins.push(pair);
			}
			Object.values(o).forEach(collectSrc);
		})(src);
		const toolIds = new Set(srcText.match(/TL-[0-9a-f-]{8,}/g) || []);
		for (const tid of toolIds) {
			if (!snapText.includes(tid)) missingTools.push(tid);
		}
		for (const n of src.nodes || []) {
			const nd = (n && n.data) || {};
			if (nd.transferNumber && !snapTransferNumbers.has(String(nd.transferNumber))) missingNumbers.push(String(nd.transferNumber));
			if (nd.url && !snapWebhookUrls.has(String(nd.url))) missingUrls.push(String(nd.url).slice(0, 60));
			for (const t of nd.tools || []) {
				if (t.type === "code" && t.config && t.config.snippet_id) {
					// must exist as a customCode STEP with the same id+version pair
					const pair = `${t.config.snippet_id}@${t.config.snippet_version ?? ""}`;
					if (!snapCodeStepPairs.has(pair)) codeToolsAsTools.push(`${nd.name || n.id}: ${t.name} not re-represented as code step (pair ${pair.slice(0, 12)}…)`);
				}
			}
			const gp = (n && n.globalConfig && n.globalConfig.globalPrompt) || "";
			if (gp && !(snap.settings.systemPrompt || "").includes(gp)) {
				promptContained = false;
				promptDetail = `globalPrompt of ${sp} not contained in systemPrompt`;
			}
		}
	}
	if (personaPath) {
		const persona = loadJson(personaPath);
		const pp = String(persona.personality_prompt || "");
		if (pp && !(snap.settings.systemPrompt || "").startsWith(pp)) {
			promptContained = false;
			promptDetail = "personality_prompt is not the verbatim head of systemPrompt";
		}
		for (const c of persona.pathway_conditions || []) {
			if (c.prompt && !snapText.includes(JSON.stringify(String(c.prompt)).slice(1, -1))) {
				check("P8", `persona condition "${c.name}" carried verbatim`, false, "entry description differs from pathway_conditions prompt");
			}
		}
	}
	if (sourcePaths.length || personaPath) {
		check("P1", "every source snippet (id, version) PAIR present", missingPins.length === 0, missingPins.map((x) => x.slice(0, 14) + "…").join(", "));
		check("P2", "every source TL- tool id present", missingTools.length === 0, missingTools.join(", "));
		check("P3", "every transfer number present on a transfer step", missingNumbers.length === 0, missingNumbers.join(", "));
		check("P4", "every webhook URL present on a webhook step", missingUrls.length === 0, missingUrls.join("; "));
		check("P5", "code-type attached tools re-represented as code steps", codeToolsAsTools.length === 0, codeToolsAsTools.join("; "));
		check("P7", "global/persona prompt carried verbatim", promptContained, promptDetail);
	}

	const passed = checks.every((c) => c.passed);
	process.stdout.write(`${JSON.stringify({ passed, checks }, null, 2)}\n`);
}

try {
	main();
} catch (e) {
	process.stdout.write(JSON.stringify({ passed: false, error: String(e && e.message) }));
	process.exitCode = 2;
}
