---
description: Test the local Bland pathway — a focused node/runtime check when a node is named, or a full agent-to-agent simulation otherwise. Use when the user wants to test, try, simulate, or run the pathway, check how a specific node behaves, or do a dry-run conversation before committing.
argument-hint: "[node]"
allowed-tools:
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "Read"
  - "Glob"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" validate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" generate:*)"
---

# Test Bland Pathway

Run a behavior check against the current pathway. The runtime test is a **Claude-native simulated call**: *you* invent a customer scenario, drive a turn-by-turn text conversation against the pathway through the chat-simulation endpoint, then verify the expected outcomes against the transcript you produced. The offline codec only self-checks structure — it never runs conversations.

Argument: `$ARGUMENTS` — an optional node slug or node name to focus on. If empty, run a full-conversation simulation. When a node is named, pick a customer scenario that routes through that node and judge that node's behavior (route/extraction/prompt) specifically.

Steps:

1. **Validate first.** If you have not validated since the last edit, run `/norm:validate` and resolve errors before testing.

2. **Offline round-trip self-check (networkless).** Confirm the local tree reconstructs losslessly — a corrupted structured surface would silently change the committed graph:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" rebuild pathway/ > .norm/_rt.json
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" generate .norm/_rt.json .norm/_rt_tree
   ```

   Then `Read`/`Glob` to compare the non-`.pathways/` prose files of `pathway/` against `.norm/_rt_tree/` — they should match byte-for-byte. A mismatch means a raw edit corrupted a structured surface; localize and fix it before the runtime test.

3. **Check for server drift.** The simulation runs against the *server's* current pathway, not your local edits — `/norm:commit` first if you want to test your changes. Read the baseline `pathway_id` (`.norm/baseline.json`) and, if needed, `bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }` (unwrap `.data`) to confirm what is live. If the server is ahead, stop and re-clone via `/norm:clone` before testing.

4. **Define the scenario and expected outcomes.** In one or two lines, state the customer persona, their goal, and a short **expected-outcome checklist** — the concrete things a good call must achieve (e.g. greeted, intent captured, the right variable extracted, routed to the correct node, ended cleanly). You are about to run the call, so you are the judge: pick outcomes you can confirm from the transcript.

5. **Drive the simulated call.** This is a pure simulation — no real call, no recipient, no outbound side effect — so it runs freely (no confirmation gate).
   - Open a chat instance: `call_bland_api` `{ method: "POST", path: "/v1/pathway/chat/create", body: { pathway_id: "<pathway_id>" } }`. Read `data.chat_id`. (Add `request_data: { ... }` to seed initial variables, or `start_node_id` to begin at a specific node — e.g. when `$ARGUMENTS` names a node you want to reach directly.)
   - Play the customer turn by turn: `call_bland_api` `{ method: "POST", path: "/v1/pathway/chat/<chat_id>", body: { message: "<your customer line>" } }`. Each response returns `data.assistant_responses` (the pathway's reply), `data.current_node_name` / `data.current_node_id` (where routing landed), `data.variables` (extracted state), and `data.completed`. Read the reply, decide the customer's next line in character, and keep going until `data.completed` is true or the conversation has clearly concluded.

6. **Verify expected outcomes against the transcript.** Walk your checklist from step 4 item by item against what the call surfaced — the `assistant_responses` you collected, the node path (`current_node_name`), and the extracted `variables`. Mark each outcome met or missed with the turn/value that proves it. Do not claim the test passed unless every required outcome is met from the actual transcript — never hand-wave or assume a turn that the endpoint did not return.

Report: the scenario, the chat_id, the per-outcome checklist (met/missed with evidence), the final node and `completed` state. If an outcome missed, localize the defect to a surface (prompt prose, condition prose, edge label, tool schema, variables, or model) and propose the smallest fix. For repeated edit→re-simulate until a fixed target holds, use `/norm:loop`.
