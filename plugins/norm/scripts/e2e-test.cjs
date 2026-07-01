#!/usr/bin/env node
"use strict";
/**
 * Bland Norm — end-to-end flow test. Run in your OWN terminal (not through the
 * agent) so writes aren't classifier-gated:
 *
 *   BLAND_API_URL=https://kylelocaldev.internal.bland.ai node scripts/e2e-test.cjs
 *
 * Key: reads BLAND_API_KEY, else ~/Downloads/api_key (4).txt. Needs node >= 18.
 * It creates a THROWAWAY pathway, exercises clone/generate/edit/rebuild/commit/
 * verify + a chat-sim turn, then deletes the throwaway. Nothing else is touched.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const CODEC = path.join(HERE, "..", "bin", "norm-sync.cjs");
const BUNDLE = path.join(HERE, "..", "bin", "engine.bundle.cjs");
const BASE = (process.env.BLAND_API_URL || "https://kylelocaldev.internal.bland.ai").replace(/\/+$/, "");
const REF_PATHWAY = process.env.NORM_TEST_PATHWAY || "2370b271-9da3-45c3-bdc5-bb8c51b1d338";

let KEY = process.env.BLAND_API_KEY;
if (!KEY) { try { KEY = fs.readFileSync(path.join(os.homedir(), "Downloads", "api_key (4).txt"), "utf8").trim(); } catch {} }
if (!KEY) { console.error("No API key. Set BLAND_API_KEY or put it in ~/Downloads/api_key (4).txt"); process.exit(1); }

const R = [];
const rec = (name, ok, detail) => { R.push(ok); console.log(`  ${ok ? "\x1b[32m✅" : "\x1b[31m❌"} ${name}\x1b[0m${detail ? ` — ${detail}` : ""}`); };
const unwrap = (j) => (j && j.data && j.data.data) || (j && j.data) || j;
async function api(method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, j, raw: t };
}
const sh = (args) => execFileSync(process.execPath, [CODEC, ...args], { encoding: "utf8" });

(async () => {
  console.log(`\nBland Norm — end-to-end test\n  URL: ${BASE}\n  node: ${process.version}\n`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "norm-e2e-"));
  let pid = null;

  // 1) Engine bundle: real-engine round-trip, edges must nest under data.
  try {
    const eng = require(BUNDLE);
    const nodes = [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", type: "Default", data: { name: "Greeting", prompt: "Greet the caller warmly.", isStart: true }, position: { x: 0, y: 0 } },
      { id: "bbbbbbbb-0000-4000-8000-000000000002", type: "End Call", data: { name: "Wrap Up", prompt: "Thank the caller and end." }, position: { x: 0, y: 120 } },
    ];
    const edges = [{ id: "aaaaaaaa-to-bbbbbbbb", source: nodes[0].id, target: nodes[1].id, data: { label: "done" } }];
    const files = eng.generateFiles(nodes, edges);
    const back = eng.exportToJSON(new Map(files.map((f) => [f.path, f.content])));
    const e = back.edges[0];
    rec("engine bundle round-trip (edge label nested under data)", back.nodes.length === 2 && e.data && "label" in e.data && !("label" in e), `edge.data.label=${JSON.stringify(e.data && e.data.label)}`);
  } catch (err) { rec("engine bundle round-trip", false, err.message); }

  // 2) Read an existing pathway the canonical way (get_one, full graph).
  try {
    const meta = unwrap((await api("GET", `/v1/pathway/${REF_PATHWAY}`)).j);
    const pv = meta.production_version_number;
    const one = unwrap((await api("POST", "/v1/convo_pathway/get_one", { id: REF_PATHWAY, version_number: pv })).j);
    rec("read via get_one (full graph)", Array.isArray(one.nodes) && one.nodes.length > 0, `${one.nodes && one.nodes.length} nodes, v${pv}`);
  } catch (err) { rec("read via get_one", false, err.message); }

  // 3) Create a throwaway pathway.
  let ver = null, rev = null, graph = null;
  try {
    const c = await api("POST", "/v1/convo_pathway/create", { name: `norm-e2e-${Date.now()}`, description: "throwaway e2e test — safe to delete" });
    const d = unwrap(c.j);
    pid = d.pathway_id || d.id || (d.pathway && d.pathway.id);
    rec("create throwaway pathway", c.status < 300 && !!pid, `status ${c.status}, id=${pid || JSON.stringify(c.j).slice(0, 120)}`);
  } catch (err) { rec("create throwaway pathway", false, err.message); }

  // 4) Read its version + revision, then its graph.
  if (pid) {
    try {
      const versions = unwrap((await api("GET", `/v1/pathway/${pid}/versions`)).j);
      const arr = Array.isArray(versions) ? versions : versions.versions || [];
      const v = arr[arr.length - 1] || arr[0];
      ver = v && v.version_number; rev = v && v.revision_number;
      const one = unwrap((await api("POST", "/v1/convo_pathway/get_one", { id: pid, version_number: ver })).j);
      graph = { nodes: one.nodes || [], edges: one.edges || [] };
      rec("read new pathway version + graph", ver != null, `version_number=${ver}, revision_number=${rev}, ${graph.nodes.length} nodes`);
    } catch (err) { rec("read new pathway version", false, err.message); }
  }

  // 5) generate -> edit -> rebuild via the REAL codec.
  let rebuilt = null, marker = `E2E_EDIT_${Date.now()}`;
  if (graph) {
    try {
      fs.writeFileSync(path.join(tmp, "graph.json"), JSON.stringify(graph));
      sh(["generate", path.join(tmp, "graph.json"), path.join(tmp, "pathway")]);
      // edit: append a marker to the global prompt (always present, prose surface)
      const gp = path.join(tmp, "pathway", ".pathways", "global_prompt.md");
      fs.mkdirSync(path.dirname(gp), { recursive: true });
      fs.appendFileSync(gp, `\n\n${marker}\n`);
      rebuilt = JSON.parse(sh(["rebuild", path.join(tmp, "pathway")]));
      rec("generate -> edit -> rebuild (real engine codec)", Array.isArray(rebuilt.nodes), `${rebuilt.nodes.length} nodes, ${rebuilt.edges.length} edges`);
    } catch (err) { rec("generate/edit/rebuild", false, err.message); }
  }

  // 6) COMMIT via /v1/convo_pathway/update (the endpoint fix). THE key test.
  if (pid && ver != null && rebuilt) {
    try {
      const u = await api("POST", `/v1/convo_pathway/update?force=true`, { id: pid, version_number: ver, nodes: rebuilt.nodes, edges: rebuilt.edges, revision_number: rev });
      rec("COMMIT via POST /v1/convo_pathway/update", u.status < 300, `status ${u.status}${u.status >= 300 ? " — " + JSON.stringify(u.j).slice(0, 200) : ""}`);
      // 7) verify the edit persisted
      const after = unwrap((await api("POST", "/v1/convo_pathway/get_one", { id: pid, version_number: ver })).j);
      const persisted = JSON.stringify(after).includes(marker);
      rec("edit persisted on server (re-read)", persisted, persisted ? "marker found in saved graph" : "marker NOT found");
    } catch (err) { rec("commit/verify", false, err.message); }
  }

  // 8) Chat-sim turn against the reference pathway (proves the loop's sim).
  try {
    const cc = await api("POST", "/v1/pathway/chat/create", { pathway_id: REF_PATHWAY });
    const chatId = unwrap(cc.j).chat_id;
    if (chatId) {
      const turn = await api("POST", `/v1/pathway/chat/${chatId}`, { message: "Hi, I need help." });
      const td = unwrap(turn.j);
      const reply = (td.assistant_responses && td.assistant_responses[0]) || td.message;
      rec("chat-sim turn (POST /v1/pathway/chat/*)", turn.status < 300 && !!reply, reply ? `agent replied: "${String(reply).slice(0, 60)}..."` : `status ${turn.status}`);
    } else { rec("chat-sim turn", false, `no chat_id (create status ${cc.status})`); }
  } catch (err) { rec("chat-sim turn", false, err.message); }

  // 9) Cleanup: delete the throwaway.
  if (pid) {
    try {
      const del = await api("POST", "/v1/convo_pathway/delete", { id: pid });
      rec("cleanup: delete throwaway pathway", del.status < 300, del.status < 300 ? "deleted" : `status ${del.status} — ⚠ MANUAL CLEANUP: delete pathway ${pid}`);
    } catch (err) { rec("cleanup delete", false, `⚠ MANUAL CLEANUP: delete pathway ${pid} (${err.message})`); }
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  const pass = R.filter(Boolean).length, total = R.length;
  console.log(`\n${pass === total ? "\x1b[32m" : "\x1b[31m"}${pass}/${total} checks passed\x1b[0m${pid && R[R.length - 1] === false ? `  (⚠ throwaway pathway ${pid} may need manual deletion)` : ""}\n`);
  process.exit(pass === total ? 0 : 1);
})();
