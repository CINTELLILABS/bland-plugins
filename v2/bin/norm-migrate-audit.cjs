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
	// S3b/S3c — the two live-run crash classes: a start pill with no outgoing
	// edge compiles to an unenterable flow (entryNodeId "" — the hub answers
	// every lane itself), and a variables row without type/accurateSpelling
	// crashes the compiler at chat-session creation (ScenarioVariable).
	let startEdgeOk = true;
	let varRowOk = true;
	const wiringIssues = [];
	for (const s of scenarios) {
		const d = s.data || {};
		const fn = ((d.flow || {}).nodes || []);
		const fe = ((d.flow || {}).edges || []);
		const startNode = fn.find((n) => n.type === "start");
		if (startNode && !fe.some((e) => e.source === startNode.id)) {
			startEdgeOk = false;
			wiringIssues.push(`${d.name || s.id}: start pill has no outgoing edge`);
		}
		for (const step of fn) {
			for (const row of ((step.data || {}).variables || [])) {
				if (typeof row.type !== "string" || typeof row.accurateSpelling !== "boolean") {
					varRowOk = false;
					wiringIssues.push(`${d.name || s.id}/${(step.data || {}).name || step.id}: variables row "${row.key}" missing type/accurateSpelling`);
				}
			}
		}
	}
	check("S3b", "every start pill points at an entry step", startEdgeOk, wiringIssues.filter((x) => x.includes("start pill")).slice(0, 5).join("; "));
	check("S3c", "variables rows carry type + accurateSpelling", varRowOk, wiringIssues.filter((x) => x.includes("variables row")).slice(0, 5).join("; "));

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
	let reachableNestedEndCall = false;
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
		// S6 counts an in-flow end-call only when the flow can get to it: walk
		// from the Start pill over edges, route targets and response pathways.
		const next = new Map();
		const link = (from, to) => {
			if (to) next.set(from, [...(next.get(from) || []), to]);
		};
		for (const e of fe) link(e.source, e.target);
		for (const n of fn) {
			const nd = n.data || {};
			for (const r of nd.rules || []) link(n.id, r.targetNodeId);
			link(n.id, nd.fallbackNodeId);
			for (const t of nd.tools || []) for (const rp of t.responsePathways || []) link(n.id, rp.targetId || rp.targetNodeId);
			for (const rp of nd.responsePathways || []) link(n.id, rp.targetNodeId || rp.targetId);
		}
		const startPill = fn.find((n) => n.type === "start");
		const seen = new Set();
		const queue = startPill ? [startPill.id] : [];
		while (queue.length) {
			const id = queue.pop();
			if (seen.has(id)) continue;
			seen.add(id);
			queue.push(...(next.get(id) || []));
		}
		if (fn.some((n) => n.type === "end-call" && seen.has(n.id))) reachableNestedEndCall = true;
	}
	check("S5", "all targets resolve", targetIssues.length === 0, targetIssues.slice(0, 5).join("; "));
	// A v1 End Call carries as an end-call step inside its flow, so the
	// hang-up can live there instead of at the root (as the platform's own
	// parity audit accepts). An in-flow end-call nothing leads to does not
	// count.
	//
	// S6 deliberately does NOT require a root end-call just because some flow
	// returns to the hub: handing back so the hub can route onward is a valid
	// design and is not a hang-up. The one hand-back that IS a v1 hang-up, an
	// End Call with a code tool (built as a wrap-up step), is checked exactly,
	// against the source, by P10 below.
	const rootEndCall = nodes.some((n) => n.type === "end-call");
	check("S6", "an end-call exists (root, or inside a flow and reachable from its Start)", rootEndCall || reachableNestedEndCall, "");
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
	// "key=target" -> how many steps carry it. Counted per step, so a setting
	// dropped from one of two steps that share a variable still fails P9.
	const snapCaptureAs = new Map();
	const srcCaptureAs = new Map();
	const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
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
		if (typeof o.captureAs === "string" && typeof o.key === "string") bump(snapCaptureAs, `${o.key}=${o.captureAs}`);
		if (o.type === "webhook" && o.data && typeof o.data.url === "string") snapWebhookUrls.add(o.data.url);
		if (o.type === "transfer" && o.data && typeof o.data.transferNumber === "string") snapTransferNumbers.add(o.data.transferNumber);
		Object.values(o).forEach(collect);
	})(snap);

	const missingPins = [];
	const missingTools = [];
	const missingNumbers = [];
	const missingUrls = [];
	const codeToolsAsTools = [];
	const wrapUpEndCalls = [];
	const missingCapture = [];
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
				if (t.type === "code" && t.config && t.config.snippet_id && n.type === "End Call") wrapUpEndCalls.push(String(nd.name || n.id));
				if (t.type === "code" && t.config && t.config.snippet_id) {
					// must exist as a customCode STEP with the same id+version pair
					const pair = `${t.config.snippet_id}@${t.config.snippet_version ?? ""}`;
					if (!snapCodeStepPairs.has(pair)) codeToolsAsTools.push(`${nd.name || n.id}: ${t.name} not re-represented as code step (pair ${pair.slice(0, 12)}…)`);
				}
			}
			// v1 capture settings ({variable: target}) carry as the variable
			// row's captureAs.
			for (const [key, target] of Object.entries(nd.captureKinds || {})) {
				if (typeof target === "string" && target) bump(srcCaptureAs, `${key}=${target}`);
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
		// A v1 End Call with a code tool migrates as a wrap-up step that
		// returns to the hub (an end-call step cannot run a snippet), so that
		// call can only end from a root end-call. An in-flow end-call in some
		// other flow does not cover it.
		//
		// P10 is a structural minimum and is meant to be: it proves a root
		// end-call EXISTS, not that the hub picks it after the wrap-up. That
		// choice is the hub model reading entry descriptions at run time. No
		// static check in this file can decide it, and this audit never
		// judges entry wording anywhere (S1 to S8 are all structural). The
		// hang-up at that point is proven where every other behavior is: the
		// simulation lane for that terminal in /norm:simulate (migrate step
		// 6, graded on engine traces). This is also not a new gap: main builds
		// this exact wrap-up for EVERY End Call and checks it the same way
		// (old S6: "root end-call exists"). This PR removes that reliance for
		// every End Call except the one kind an end-call step cannot express.
		check(
			"P10",
			"a v1 End Call with a code tool has a root end-call to hang up after it",
			wrapUpEndCalls.length === 0 || rootEndCall,
			wrapUpEndCalls.slice(0, 5).join(", "),
		);
		for (const [pair, want] of srcCaptureAs) {
			const got = snapCaptureAs.get(pair) || 0;
			if (got < want) missingCapture.push(`${pair} on ${got} of ${want} steps`);
		}
		check("P9", "every v1 capture setting carried as captureAs", missingCapture.length === 0, missingCapture.slice(0, 5).join(", "));
	}


	// ── v2 architecture (migration doctrine — deterministic, FAIL not warn) ──
	// A v1 pathway poured into one flow hanging off Start is still a v1 pathway:
	// the hub is switched off for the whole call, root end-calls become dead
	// code, and the first hold condition traps the caller. These checks are the
	// machine half of /norm:validate 20–25; the Stop hook blocks on them.
	{
		const STEP_TYPES = new Set(["prompt", "knowledge", "tool", "webhook", "customCode", "sms", "transfer", "smsOtp", "identityQuestions", "pressButton", "waitForResponse", "transferPathway", "playAudio", "route", "channel", "ivr", "scheduling", "twilioFlowRedirect", "amazonConnect", "resetSttLanguage", "end-call"]);
		const SPEAKING = new Set(["prompt", "knowledge", "waitForResponse", "end-call"]);
		const PRE_SPEECH = new Set(["customCode", "route", "webhook", "tool"]);
		const flowSteps = (n) => {
			if (n.type === "scenario") return [n];
			const f = (n.data || {}).flow;
			return f && Array.isArray(f.nodes) ? f.nodes.filter((x) => STEP_TYPES.has(x.type)) : [];
		};
		const rootFlows = nodes.filter((n) => n.type === "scenario" || n.type === "complex-scenario");
		const totalSteps = rootFlows.reduce((acc, n) => acc + flowSteps(n).length, 0);
		const byId = new Map(nodes.map((n) => [n.id, n]));
		const entryTarget = inboundEdge ? byId.get(inboundEdge.target) : undefined;
		const name = (n) => String(((n || {}).data || {}).name || (n || {}).id || "?");

		// A0 — Start IS the Initialization code step. When the v1 start node is
		// Custom Code, the snapshot must carry it as `initialization` (runs at
		// connect, before the first sentence) with the same snippet pin / code.
		if (sourcePaths.length) {
			const starts = [];
			for (const sp of sourcePaths) for (const n of loadJson(sp).nodes || []) if (n && n.type === "Custom Code" && n.data && n.data.isStart === true) starts.push(n);
			if (starts.length) {
				const init = snap.initialization || {};
				const step = init.step || {};
				const src = starts[0].data || {};
				const pinOk = src.snippet_id ? step.snippetId === src.snippet_id : typeof step.code === "string" && step.code.trim() === String(src.code || "").trim();
				check("A0", "v1 start code node carried as initialization (enabled, same snippet pin)", init.enabled === true && pinOk, init.enabled === true && pinOk ? "" : init.enabled === true ? `initialization pin differs from start node "${src.name || starts[0].id}"` : `initialization missing/disabled — start node "${src.name || starts[0].id}" (${String(src.snippet_id || "").slice(0, 8)}…) must run at connect, not inside a scenario`);
			}
		}

		// A1 — a Start scenario (inbound edge re-pointed off the hub) is the
		// rare exception and may hold ONLY pre-speech work: code, deterministic
		// routes, webhooks, tools. Zero speaking steps — the greeting is the
		// hub's. ≤ 1/5 of all steps, and it must exit to the hub.
		if (entryTarget && entryTarget.type !== "agent") {
			const st = flowSteps(entryTarget);
			const speaking = st.filter((x) => SPEAKING.has(x.type));
			const foreign = st.filter((x) => !PRE_SPEECH.has(x.type) && !SPEAKING.has(x.type));
			const share = totalSteps ? st.length / totalSteps : 0;
			const hasExit = entryTarget.type === "scenario" || ((entryTarget.data || {}).flow || { nodes: [] }).nodes.some((x) => x.type === "end");
			const problems = [];
			if (speaking.length) problems.push(`${speaking.length} speaking step(s) (${speaking.map(name).slice(0, 4).join(", ")}) — nothing speaks before the hub; the greeting is the hub's`);
			if (foreign.length) problems.push(`non-pre-speech step(s): ${foreign.map((x) => `${name(x)} (${x.type})`).slice(0, 4).join(", ")}`);
			if (share > 0.2) problems.push(`${st.length}/${totalSteps} steps (${Math.round(share * 100)}%) in Start — budget is 20%`);
			if (!hasExit) problems.push("no exit pill — the call can never reach the hub");
			check("A1", "Start scenario holds only pre-speech work (0 speaking steps; code/route/webhook/tool only; ≤20% of steps; exits to hub)", problems.length === 0, `"${name(entryTarget)}": ${problems.join("; ")}`);
		} else {
			check("A1", "Start scenario holds only pre-speech work", true, "inbound edge targets the hub");
		}

		// A2 — intents are hub children: besides the Start scenario there must
		// be at least two hub-enterable siblings (scenarios or root end-calls),
		// and no single flow may hold more than 60% of all steps.
		const siblings = nodes.filter((n) => (n.type === "scenario" || n.type === "complex-scenario" || n.type === "end-call") && (!entryTarget || n.id !== entryTarget.id));
		const fat = rootFlows.filter((n) => totalSteps && flowSteps(n).length / totalSteps > 0.6 && (!entryTarget || n.id !== entryTarget.id));
		check("A2", "intents are hub children (≥2 siblings beside Start; no flow holds >60% of steps)", siblings.length >= 2 && fat.length === 0, `${siblings.length} sibling(s)${fat.length ? `; oversized: ${fat.map(name).join(", ")}` : ""}`);

		// A3 — every root end-call is enterable: it carries an entry
		// description for the hub, and the hub is reachable at all (Start
		// exits — covered by A1's exit test, repeated here so the message names
		// the dead end-calls).
		const rootEnds = nodes.filter((n) => n.type === "end-call");
		const startExits = !entryTarget || entryTarget.type === "agent" || entryTarget.type === "scenario" || ((entryTarget.data || {}).flow || { nodes: [] }).nodes.some((x) => x.type === "end");
		const deadEnds = rootEnds.filter((n) => !startExits || !String(((n.data || {}).entry || {}).description || "").trim());
		check("A3", "every root end-call is reachable (hub reachable + entry description present)", deadEnds.length === 0, deadEnds.map(name).join(", "));

		// A4 — universal escapes on every hold. The hold is evaluated before all
		// routing, so a hold that lacks one of these traps the call on the step.
		const ESCAPES = [
			["opt-out", /opt[- ]?out|do not call|stop calling|no longer (be |want to be )?(called|contacted)|remove .* list/i],
			["wrong person", /wrong (person|number)|not the (right|intended) person|isn'?t .* (who|the person)/i],
			["not interested", /not interested|no longer (interested|looking|in the market)|declin/i],
			["callback", /call ?back|call (me|them|you) (back|later)|better time/i],
			["transfer", /transfer|speak (to|with) (a|an|someone|a live|a human)|representative|live agent|human/i],
			["voicemail", /voicemail|voice ?mail|leave (a|your) message|the tone/i],
			["IVR", /\bivr\b|screen(er|ing)|automated (system|menu|assistant)|press \d|menu options/i],
		];
		// Required set = the escapes the v1 source itself handles anywhere (an
		// inbound agent with no voicemail lane is not asked to escape to one);
		// without a source, the caller-universal five.
		const UNIVERSAL = new Set(["opt-out", "wrong person", "not interested", "callback", "transfer"]);
		let required = ESCAPES.filter(([k]) => UNIVERSAL.has(k));
		if (sourcePaths.length) {
			const srcAll = sourcePaths.map((sp) => JSON.stringify(loadJson(sp))).join("\n");
			required = ESCAPES.filter(([, re]) => re.test(srcAll));
		}
		const holdIssues = [];
		for (const sc of rootFlows) {
			for (const st of flowSteps(sc)) {
				const lw = String(((st.data || {}).loopWhile) || "").trim();
				if (!lw) continue;
				const missing = required.filter(([, re]) => !re.test(lw)).map(([k]) => k);
				if (missing.length) holdIssues.push(`${name(sc)}/${name(st)} lacks ${missing.join(", ")}`);
			}
		}
		check("A4", `every hold condition carries the escapes the source handles (${required.map(([k]) => k).join(", ")})`, holdIssues.length === 0, holdIssues.slice(0, 4).join("; "));

		// A5 — no parking lots.
		const PARK = /legacy|archived|unreachable|never enter|do not enter|don'?t enter|parking|dead code|retired|unused/i;
		const lots = rootFlows.filter((n) => PARK.test(name(n)) || PARK.test(String(((n.data || {}).entry || {}).description || "")));
		check("A5", "no parking-lot scenarios (dead v1 nodes are dropped in the report, never warehoused)", lots.length === 0, lots.map(name).join(", "));

		// A6 — every v1 node tag is carried as a settings.tag somewhere.
		if (sourcePaths.length) {
			const srcTags = new Set();
			for (const sp of sourcePaths) {
				for (const n of loadJson(sp).nodes || []) {
					const t = ((n && n.data) || {}).tag;
					if (t && typeof t.name === "string" && t.name.trim()) srcTags.add(t.name.trim());
				}
			}
			const snapTags = new Set();
			(function collectTags(o) {
				if (Array.isArray(o)) return o.forEach(collectTags);
				if (!o || typeof o !== "object") return;
				if (o.settings && o.settings.tag && typeof o.settings.tag.name === "string") snapTags.add(o.settings.tag.name.trim());
				Object.values(o).forEach(collectTags);
			})(snap);
			const missingTags = [...srcTags].filter((t) => !snapTags.has(t));
			check("A6", "every v1 node tag carried as settings.tag", missingTags.length === 0, missingTags.join(", "));
		}
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
