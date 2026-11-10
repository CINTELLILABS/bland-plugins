# Upgrade design evidence: upgrade-design-v1

This reference is required for `outcomes-v1` upgrades. Read it before authoring
and keep the source responsibility and knowledge-scope map current for each
candidate. Legacy migrations retain their existing contract.

## Design from successful calls before choosing the graph

Read [call-quality-v1.md](call-quality-v1.md) **first**. Its supplied good-call/
bad-call definitions are the design objective, not just a score attached after
building. Also read [bland-tone-v1.md](bland-tone-v1.md), the SERVER evals
style rubric: task accomplishment and how the agent speaks are distinct
dimensions. Apply both while designing, testing and improving the agent.
Use those same outcome definitions to discover goals, choose scenario/step
boundaries, author tests, prioritize repairs and explain the result.

Before authoring a snapshot or freezing tests, write `upgrade-design-brief.md` in
this migration's workspace. This is a reviewable authoring artifact, not a new
snapshot field or a machine-verified claim of optimality. Use the source to learn
business requirements, approved facts and real integration contracts. Derive the
new conversation from the jobs callers need completed; source node boundaries,
pathway count, department labels and old routing order do not choose the design.

For each caller goal record:

- The call's purpose using the rubric's inbound/outbound distinction, and what
  `accomplished` means for this goal. An inbound caller must receive what they
  called for or a firm next step they accepted. An outbound purpose must actually
  be achieved with the human. A booking claim requires tool confirmation; a valid
  accepted next step is not the same claim as an already completed booking.
- The applicable rubric outcomes, failure evidence and sentiment deterioration
  risks using the mapping below. Explain why any category is inapplicable; do not
  add meaningless test lanes solely to cover every label.
- Required inputs, where they come from, authorization/confirmation prerequisites,
  mandatory wording and relevant knowledge/tools. Distinguish required business
  ordering from incidental old question order. Do not invent missing capability.
- Valid alternative outcomes: ineligible caller, no availability, explicit
  decline, unavailable service, escalation or a safe close. State the required
  behavior and what must never be promised for each.
- Caller corrections, detours and interruptions: which information remains valid,
  what must be rechecked, and where the task can safely continue.
- Frozen tests that independently establish these outcomes, conduct and recovery.
  Preserve existing customer checks under the input/state evidence contract.

Use this rubric-to-design mapping for each goal:

| Supplied outcome / flag | Design requirement and evidence |
|---|---|
| `accomplished` | Define the purpose and observable completion or valid accepted next step. Never treat a promise, a tool invocation or a polite goodbye as success. |
| `agent_failure` | Prevent misunderstanding, repetition/loops, wrong facts, rejection of valid requests and incorrect endings. Test corrections, knowledge grounding, routing and completion. |
| `system_failure` | Design honest handling and supported recovery for failed tools/lookups/transfers. An announced transfer is not a completed one; real-call metadata must say `transferred: true`. Audio/dead-air claims need actual voice evidence. |
| `stuck_in_menu` | Where IVR navigation applies, distinguish a navigable menu from one with no path to a person; verify supported navigation and recovery. |
| `caller_abandoned` | Keep valid progress clear and reduce avoidable friction, while retaining the rubric's definition: the caller left while the agent was handling things correctly. Do not relabel it `agent_failure` or manufacture continuation. |
| `caller_ineligible` | Correctly enforce policy, eligibility and identity checks; explain the block and offer only authorized next steps. Keep the bad-call review flag without weakening the gate. |
| `declined`, `no_request`, `out_of_scope`, `no_human` | Define truthful handling and an appropriate exit for applicable cases. They are not accomplishments merely because they do not count toward bad_call; no_request is inbound-only. |
| `sentiment_worsened` | Design clear explanations, respectful corrections and recovery; judge start/end sentiment from caller words. Do not infer satisfaction from the agent's tone or forced pleasantries. |
| `nothing_to_fix` | Preserve its calibrated independent flag. It is neither the boolean inverse of bad_call nor proof the purpose was accomplished. |

For each proposed scenario boundary or step, state which purpose it advances or
which of these failure modes it prevents, and what evidence will test that claim.
For example, booking confirmation belongs beside the booking action because it
prevents incorrect completion claims; a separate routing hub hop earns no value
unless it helps resolve intent or safely change jobs. Respectful opt-out handling
is a correct declined outcome, not a failure to be optimized into a sale.

Do not change the scorer prompt, thresholds or category definitions. A text
simulation may test rubric-derived behavior, but cannot produce calibrated
phone-call flags without completed-call evidence. Keep evidence unscored when
missing. Preserve all four metrics separately; do not invent an aggregate score
or optimize away valid policy refusals to reduce bad_call.

Start with the hub owning ordinary conversation and simple actions. A paper
comparison may identify a candidate boundary, but does not prove that an extra
scenario improves calls. Retain a separate flow for a required ordered control
boundary, or demonstrate its reliability benefit on the same frozen outcome
suite as the consolidated version. Do not build alternatives merely to satisfy
a comparison quota. Extra nodes, fewer nodes, more scenarios and fidelity to the
source canvas are not quality measures.

## Choose hub, simple scenario, complex scenario or step

Here **agent scenario** means an executable design container. An **evaluation
scenario** is a test caller/case; its count does not determine the number of agent
scenarios. Existing `responsibilities[].scenario_ids` refer to evaluation IDs.

| Construct | Use it when | Example |
|---|---|---|
| Hub (`agent`) | Most conversation, ordinary business logic, questions, simple actions, intent changes and follow-ups. Multiple goals can share it. | Answer hours, identify what the caller needs, look up status, then offer the next useful action. |
| Simple scenario (`scenario`) | A required control cannot be enforced safely in the hub, or repeated comparative tests demonstrate a reliability benefit. | A narrowly scoped protected action with an explicit permission boundary. Ordinary appointment status stays in the hub. |
| Complex scenario (`complex-scenario`) | A bounded business use case requires strict ordered steps and protected action/recovery boundaries. | Scheduling: check availability, confirm the selected slot, submit the booking, verify success. Complex authentication. |
| Step inside a scenario | A required prerequisite, deterministic decision, action or recovery boundary cannot safely be combined. | Confirm immediately before booking; branch on its actual result. |
| Start | Necessary call screening or automated pickup/IVR navigation, only as a last resort. | Navigate a phone menu, then hand control to the hub. |
| Global conduct/knowledge | Applicable throughout the call. Preserve branch-specific access where required. | Honesty rules and approved opening hours. |

Use the fewest nodes that preserve required behavior. A different question, tool,
department, caller goal or evaluation case is not itself a new scenario. Prefer
hub instructions and supported attached tools for ordinary conversation. Do not
force independent goals onto disjoint prompts; several can share the hub.

For every proposed non-hub conversational node, put one of these justifications
in `upgrade-design-brief.md`:

- **Required control:** name the source requirement, the ordered prerequisite or
  permission/write boundary, and why a supported hub tool guard cannot enforce
  it. Keep protected actions deterministic and test attempts to bypass the gate.
- **Measured reliability:** name the exact consolidated and split version IDs,
  frozen case IDs, repeated results, and the specific hub failure the split fixes.
  Run each version at least three times per case with the same request fixtures,
  tool-response conditions and judges. Include the whole suite, not just the
  failing case; report every attempt and any regressions. A proposed split is
  provisional until this evidence exists.

Prompt length, perceived density, a separate source node, and a distinct caller
goal are not evidence that a split is needed. First remove duplicate instructions,
clarify tool descriptions and state, and move approved reference material into
correctly scoped knowledge sources. Retain an optional split only if required outcomes and
conduct remain satisfied and the repeated comparison supports a reliability
improvement. With comparable results, keep the consolidated design. A node that
only reads an appointment status returned by a lookup normally belongs in the
hub; needing exact approved wording alone does not prove it needs its own node.

Never build a routing-only hub that hands the entire conversation to one large
flow. Inbound normally targets the hub. Start, `entryScenarioId` and initialization
routes must not bypass it with the business call body. Initialization may load
required pre-answer context; it is not a conversation workflow.

Each strict workflow returns to the hub when complete, so the caller can choose
another need. On intent change, exit safely and preserve collected information;
resolve pending writes and confirmations before resuming elsewhere. An incidental
question need not interrupt a workflow. Re-entry follows its Start edge: model
and test resume state explicitly instead of assuming it resumes the old step.
Do not force terminal handoffs or hangups back through a speaking hub turn.

For each selected agent scenario, the brief states its entry, owned outcome,
working state, completion/failure exits and its required-control or measured-
reliability justification. The brief is review evidence; the structural audit
does not establish that the justification is true.
For each internal step state its distinct purpose; combine consecutive prompt
steps when separation adds no state, action, permission or recovery benefit.
For ordinary hub actions, use supported attached integration tools rather than
adding code nodes solely to satisfy pin inventory. A `custom-code/run_snippet`
tool must retain the exact snippet pin and explicit input contract in its active
embedded definition. SERVER uses the real strict integration validator and the
snippet action's input schema; IDs in prose or inactive staging definitions do
not count. Library-only or overridden definitions need resolved evidence. Keep
traversal-triggered operations as strict workflow steps when their ordering is
required; moving them to model-invoked tools is a behavioral change to test.

Put correctness-critical tool-result decisions in supported deterministic
constructs. Use global/scoped knowledge according to evidence; an incidental FAQ
must not restart a booking or erase its state. Test a question during the task,
a correction after a lookup, an intent change and a failed action where relevant.

## Improve against evidence, not graph aesthetics

Freeze the outcome suite before the first candidate as required by outcomes-v1.
Build the selected native design, inspect actual execution, and revise the layer
that caused each failure: missing input, tool contract, state boundary, routing,
knowledge scope or conversational instructions. A prompt edit cannot compensate
for the wrong scenario boundary or a missing executable action.

Correctness and required conduct must pass before optional quality is considered.
Use the supplied good/bad definitions throughout the comparison. Caller effort,
redundant questions, clarity and recovery friction are supporting explanations
for accomplishment, failure and sentiment risks, not substitute success metrics.
Keep calibrated completed-call scores separate from simulation assertions while
using the same outcome definitions to design both; text traces do not establish
voice timing. Do not change the
frozen suite to favor a redesign. After a change, test the full suite on its exact
new version and report all attempts. Prefer a simpler architecture when it meets
the same requirements with comparable evidence, not merely because it is smaller.

The final report explains the intended outcomes, chosen boundaries, why each job
is simple or complex, important rejected alternatives, intentional changes from
v1, measured results and remaining uncertainty. Passing structural checks does
not prove the best possible architecture or complete semantic coverage; customer
or independent review and representative call evidence remain necessary.

## Record responsibilities and knowledge scope on the candidate

Prepare a design map while reviewing the sources, then record it against each
pushed candidate's returned version ID. This is migration evidence in
`.norm/migration.json`, not an additional field in the agent snapshot API:

```json
{
  "head_version_id": "<pushed-version-id>",
  "responsibilities": [
    {
      "id": "product-questions",
      "description": "Answer product questions using the approved product references.",
      "source_nodes": [{ "source_index": 0, "node_id": "legacy-product-faq" }],
      "step_ids": ["native-product-knowledge-step"],
      "scenario_ids": ["<frozen-product-question-scenario-id>"]
    }
  ],
  "knowledge": [
    {
      "source_index": 0,
      "node_id": "legacy-product-faq",
      "scope": "scoped",
      "reason": "The source retrieves product documents only in the product-question branch.",
      "step_ids": ["native-product-knowledge-step"],
      "scenario_ids": ["<frozen-product-question-scenario-id>", "<frozen-outside-scope-scenario-id>"]
    }
  ]
}
```

`source_index` is zero-based source-file order, matching the repeated `--source`
arguments. `source_nodes` must cover every source data node except the synthetic
`global-prompt`. Group nodes implementing the same responsibility. Map ordinary goals to the conversational hub, which may own several responsibilities.
Keep distinct strict workflows separately accountable; do not share their
conversational steps across independent workflow responsibilities. There is no arbitrary minimum responsibility or
scenario count: a genuinely atomic source can have one goal. Every `step_ids`
reference must identify an actual native step that compiles and is reachable;
every `scenario_ids` reference must belong to the frozen evaluation suite.

Include one `knowledge` row per source node carrying `kbTool`, `kbIds`, `kb_ids`,
or pasted `kb`. Source-level knowledge uses `node_id: "$agent"`. Preserve every
source knowledge capability and classify its scope with evidence:

- `agent`: source evidence establishes conversation-wide access. The snapshot
  must attach the IDs at root `knowledge.kbIds`. These use the existing
  call-level retrieval path and runtime capability controls. Do not inject
  replacement tools or assume that saving IDs proves retrieval on every channel.
  Freeze question probes before, during and after the primary task; assert that
  questions are answered from the reference material and the task continues.
- `scoped`: attach knowledge only to the relevant native `knowledge` steps,
  preserving IDs, pasted text, query instructions, retrieval count and matching
  weight. Keep scoped knowledge out of root knowledge. Freeze both questions
  inside the relevant branch and negative probes outside it to prove that
  branch-specific content does not leak into other conversation steps.
- `unresolved`: source evidence does not establish scope. Explain what remains
  uncertain and surface it for owner review; this classification cannot complete
  the upgrade. Neither a start-node flag nor a global-node flag alone establishes
  conversation-wide knowledge. Never lift KBs automatically.

After each push, save the map as `design.json` with that exact returned head and
record it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" record-design --file design.json
```

The command stores `state.design`; mirror it into the managed runner's
`.norm/migration.json` too. A new push requires design evidence for the new head.
Before simulations, run the architecture/capability audit and record the exact
candidate design. End the managed turn so the platform can verify it before
launching the frozen suite. The local hook checks the head and arrays and blocks
unresolved knowledge. The
platform authoritatively verifies source coverage, compiled reachability,
hub ownership, bounded workflow separation, scoped retrieval options, root knowledge and frozen
scenario references. Metadata alone does not establish semantic coverage:
source classification still requires review, and actual scenario assertions and
results must prove that questions are answered and scoped content does not leak.
