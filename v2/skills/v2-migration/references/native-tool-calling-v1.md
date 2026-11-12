# Native function calling: native-tool-calling-v1

Read this reference only when the run brief says the agent uses native
function calling. Otherwise skip it and follow the other references as
written. This reference adds rules for writing prompts and tool definitions.
It does not replace [outcomes-v1](outcomes-v1.md),
[upgrade-design-v1](upgrade-design-v1.md),
[call-quality-v1](call-quality-v1.md) or [bland-tone-v1](bland-tone-v1.md),
which still govern design, testing and acceptance.

Each rule says what to do and why, and cites its source in parentheses. The
sources are SERVER `main` at commit `a6794a041e48`:

- Decision records in `docs/decisions/`, cited by file name without `.md`.
  The October 28 record is cited as "2026-10-28 native calling V4"; its file
  matches `2026-10-28-native-calling-*.md`.
- Runtime code in `apps/api/src/lib/pathways/`: `prompts/functionCallingDialogue.ts`,
  `tools/nativeToolDefs.ts`, `tools/toolUtils.ts`, `tools/toolProtocol.ts`,
  `nodes/node.ts`, `nodes/schedulingNode.ts` and `nodes/waitForResponseNode.ts`.

Don't treat a rule here as a runtime guarantee unless it says the runtime
enforces it. Several are prompt guidance that replays still break, so the
[simulation checks](#check-native-behavior-in-simulations) are the evidence.

## How a native turn works

On a native turn, the runtime does the following:

- It sends the step's tools as function definitions in the request, next to a
  fixed system prompt. The model replies with plain text, a tool call, or
  both. The prompt text carries neither the tool list nor a response format
  (`functionCallingDialogue.ts`).
- It allows at most one tool call per response and turns off parallel tool
  calls in the request (2026-10-28 native calling V4).
- It holds any text that comes with a custom tool call as an unspoken draft.
  The caller hears only a response that has no custom tool call. The next
  response sees the draft and the tool result, and must include any question
  the caller still needs to hear (2026-11-09-deferred-native-tool-speech).
- It offers three built-in tools: `press_button` (keypad digits), `wait`
  (stay silent and keep listening) and `finish` (end the call, with an
  optional short goodbye). Built-in `wait` and `finish` keep their own
  delivery (`nativeToolDefs.ts`, 2026-11-09-deferred-native-tool-speech).
- It validates each call's arguments against the tool's schema before the
  tool runs (`nativeToolDefs.ts`).

Native calling applies per step. A step uses it only when the call resolved to
native calling and the step's compiled node runs in tool mode: the node has
tools, or the agent runs every node in tool mode (`toolProtocol.ts`,
`node.ts`). Scheduling and Wait for Response steps never use it; see
[Leave Scheduling and Wait for Response steps on the legacy protocol](#leave-scheduling-and-wait-for-response-steps-on-the-legacy-protocol).

## Write prompts for native calling

These rules apply to the global prompt (`settings.systemPrompt`) and to hub,
scenario and flow-step prompts.

1. Describe the conversation, not a response format. Remove instructions that
   describe tool-call syntax, ask for JSON, name the legacy actions (`Speak`,
   `Press Button`, `Wait`, `Finish`) or show `{"a": ..., "in": ...}`
   examples. Don't ask for brackets, markup or lists in speech. Why: tool
   definitions travel in the request, and the runtime prompt tells the model
   that delivered text is spoken and must be natural language with no
   structured formats (`functionCallingDialogue.ts`).
2. Plan one tool call per response. When a step needs two tools, write them in
   order: call the first, call the second after its result, then answer. Don't
   write "look up the account and book the slot" as a single action. Why: the
   request allows one call per response, and sequential calls across responses
   still work (2026-10-28 native calling V4,
   2026-11-05-native-tool-content-is-caller-dialogue).
3. Don't script a line for the model to say while a tool runs. When the caller
   needs a line such as "One moment while I check that," set it as the tool's
   filler speech: `wrapperSpeech` on the attached tool or `speech` on the
   definition. Filler speech plays on voice calls only (see
   [what the caller hears while a tool runs](../../tool-library/references/how-it-works.md#what-the-caller-hears-while-it-runs)).
   Why: text sent with a custom tool call is held and never played, while
   authored tool announcements still play
   (2026-11-09-deferred-native-tool-speech).
4. Ask, then stop. Write a question and the tool that needs its answer as
   separate moves, for example: "Ask which day works. After the caller
   answers, call `check_availability` with that day." Don't tell the model to
   ask and act in the same response, or to assume a likely answer. Why: the
   runtime prompt tells the model to end its response after a question, never
   answer for the caller, and call `wait` with no text if a tool result
   arrives first. That is prompt guidance only. The runtime check that once
   enforced it was withdrawn, and replays still show tool calls sent before
   the caller answered (2026-11-06-native-questions-yield-the-caller-turn,
   2026-11-05-native-tool-content-is-caller-dialogue).
5. Describe when to end the call, stay silent or press keys, and don't name an
   action. Write "end the call after you say goodbye," "stay silent while the
   menu plays" or "press 2 for billing." Don't write "use the Finish tool,"
   "output Wait" or "say the digit by itself." Why: the runtime prompt maps
   these situations to `finish`, `wait` and `press_button`. It forbids
   speaking an action name, "silence" or "." and says to press all digits in
   one `press_button` call without saying them (`functionCallingDialogue.ts`,
   `nativeToolDefs.ts`).
6. Say when a tool call is the only allowed next action. When a step must call
   a tool before it speaks, state that in the goal. Why: the runtime prompt
   then tells the model to make that call and say nothing
   (`functionCallingDialogue.ts`).
7. List what to collect and how to recover. Name every value the step must
   collect from the caller, and say what to do when a tool fails. Why: the
   runtime prompt tells the model to ask only for information the goal says to
   collect, not to repeat a failed custom tool call, and to follow the goal's
   recovery instructions instead of ending the call
   (`functionCallingDialogue.ts`).
8. Name only tools the step has. Refer to a tool only in the prompt of a step
   it is attached to, and use its exact name. Why: the model is offered only
   that step's tools. A call to a tool it wasn't offered is neither spoken nor
   run, and such calls appeared in the measured replays (`nativeToolDefs.ts`,
   2026-10-28 native calling V4).
9. Write the customer's own rules into the agent prompt. Put the customer's
   transfer rules (when to offer a transfer, whether the caller must confirm,
   what to say before connecting), acknowledgement rules, the values to
   collect before an escalation, and limits on repeating information such as
   case numbers into the global prompt or the step that owns them. Why: the
   runtime prompt adds no customer-specific instructions. Replays on the
   current runtime still showed premature transfer promises, restarted
   acknowledgements and omitted escalation inputs, and general prompt
   experiments didn't fix premature promises or repeated case numbers. The
   records leave these rules to agent prompts and tool contracts
   (2026-11-05-native-tool-content-is-caller-dialogue, 2026-10-28 native
   calling V4).

## Know when finish and wait are unavailable

Plan endings and silences around these runtime behaviors:

- Route a designed hang-up through an `end-call` step, and leave `finish` for
  the end of an ordinary conversation. Why: before a `finish` outside an End
  Call node takes effect, a separate check reviews the step goal, recent
  conversation and latest speech. An error or uncertain answer keeps the call
  open, and the check adds an inference. End Call nodes keep their authored
  behavior (2026-10-29-native-finish-requires-disconnect-validation).
- Don't write a goal that ends the call while it asks a question, offers help,
  waits for a confirmation or announces a transfer. Why: the runtime prompt
  forbids `finish` in those moments and says `finish` never transfers the
  caller. The disconnect check exists because simulations sent `finish` while
  the agent promised a transfer or awaited an answer
  (`functionCallingDialogue.ts`,
  2026-10-29-native-finish-requires-disconnect-validation).
- Don't tell a step to hang up when its `settings.advanced.disableEndCallTool`
  is `true`, or a `transfer` step before its transfer completes or fails on
  that visit. Why: `node.ts` withholds `finish` in both cases unless a custom
  tool named `finish` exists. See
  [step settings](../../v2-snapshot/references/knobs.md#step-settingsadvanced)
  for the knob, which only an import sets (`node.ts`).
- Expect a spoken reply on the turn where the caller asks the agent to hold
  on. Why: `wait` is not offered on that acknowledgement turn, so the model
  answers in words (`node.ts`).
- Say so in the goal when the agent should leave a voicemail message. Why: by
  default the runtime prompt tells the model to end the call as soon as it
  reaches a voicemail or answering system (`functionCallingDialogue.ts`).

## Write tool definitions for native calling

These rules apply to attached tools and to the library definitions they use.
For field names and the definition schema, see the
[tool library reference](../../v2-runtime/references/tool-library.md).

### Arguments

- Put only values the caller supplies in `input_schema`. Supply values the
  system already has, such as the caller's number, request data or an earlier
  tool's `response_data`, through a `{{<variable>}}` placeholder in `body` or a
  property `default`. Why: the runtime appends an argument rule to each tool
  description: pass only values the caller said or a prior tool result
  returned, leave the rest out, and the system fills missing fields from call
  data (`toolUtils.ts`). Server-owned values come from static inputs and
  schema defaults. The runtime doesn't infer ownership from names such as
  `phone` (2026-10-28 native calling V4).
- Don't tell the model to pass call data or placeholder values such as
  "Unknown." Why: the model's arguments are authoritative, and an empty string
  or null that the schema allows is used as given. An omitted optional field
  stays absent unless a static input or schema `default` fills it, and nothing
  extracts it again from the conversation. A missing required field can still
  fall back to a call variable with the same name
  (2026-10-27-native-tool-arguments-preserve-omissions, `toolUtils.ts`).
- Declare every `{{input.<name>}}` that `body` uses as an `input_schema`
  property. Why: the runtime rejects arguments the schema doesn't declare, and
  native request rendering uses only the current call's arguments, so older
  `input.<name>` values can't fill a gap (`nativeToolDefs.ts`,
  2026-10-27-native-tool-arguments-preserve-omissions).
- Mark a field required only when the tool can't run without it. Why: the
  runtime rejects a blank required string, and the model is told to leave out
  values the caller hasn't given (`nativeToolDefs.ts`, `toolUtils.ts`).

### Descriptions

- Say what the tool does and when to call it, and describe each field in its
  property `description`. Don't repeat the field list, the argument rule or the
  call limit. Why: for webhook, custom, code and chain tools, the runtime
  appends the required and optional field names, the argument rule and the
  `maxCalls` limit (default 3) to the description (`toolUtils.ts`).

### Schemas

- Use an object root: `"type": "object"` with `properties`. Why: the runtime
  offers a tool only when its parameters compile with an object root
  (`nativeToolDefs.ts`).
- Don't use `$ref`, `$defs`, `definitions`, `oneOf`, `anyOf`, `allOf`, `not`,
  `if`, `then`, `else`, `dependentSchemas`, `patternProperties` or
  `unevaluatedProperties` anywhere in the schema. Write each property inline.
  Replace a choice between shapes with one object whose optional properties
  cover both, or with an `enum`. Why: a schema that uses any of these keywords
  fails native normalization, and the runtime drops the whole tool, not just
  the keyword. Property names are data, so a property called `not` is fine
  (`nativeToolDefs.ts`).
- List each name in `required` under `properties` too. Why: a required field
  that isn't declared keeps the tool from being offered (`nativeToolDefs.ts`).
- Set `additionalProperties: true` only on an object that accepts arbitrary
  keys. Why: the runtime adds `additionalProperties: false` to every object
  that doesn't set it (`nativeToolDefs.ts`).

### Names and count

- Name each tool with letters, digits, `_` and `-` only, in 64 characters or
  fewer, and keep names unique regardless of case. Why: the runtime replaces
  other characters with `_` and cuts names at 64 characters. A tool whose
  result matches an earlier tool's name, ignoring case, is not offered
  (`nativeToolDefs.ts`). A name that needs no change also matches the name
  your prompts use.
- Don't name a custom tool `wait`, `finish` or `press_button`. Why: a custom
  tool with a built-in's name replaces the built-in and runs as a custom tool
  (`nativeToolDefs.ts`, 2026-11-09-deferred-native-tool-speech).
- Keep each step's offered tools at 128 or fewer, counting the three
  built-ins. Why: the runtime doesn't offer tools past the 128th
  (`nativeToolDefs.ts`).

## Leave Scheduling and Wait for Response steps on the legacy protocol

A `scheduling` step compiles to a Scheduling node, and a `waitForResponse`
step compiles to a Wait for Response node. Both keep the legacy protocol on
native calls. Write their prompts as you would without native calling, and
don't add built-in tool names or rules from this reference to them. Don't
count a lane that runs through them as evidence for native behavior. Why: the
Scheduling node turns off tool mode because its prompt needs plain-text output
with its own slot syntax. The node tests confirm that both nodes send their
legacy prompt and get no native tools on native calls (`schedulingNode.ts`,
`waitForResponseNode.ts`, `nodes/__tests__/nodeFunctionCalling.test.ts`).

## Check native behavior in simulations

When you freeze the suite, cover these checks with `conduct:` or `recovery:`
assertions where they apply. Read every native lane's transcript and engine
trace for them on each candidate.

| Check | Failure looks like | Source |
|---|---|---|
| Each tool runs once per need | The same tool is called again with the same arguments, or calls run past `maxCalls`. | 2026-11-09-deferred-native-tool-speech |
| No structured text is spoken | A caller-facing turn contains JSON, brackets, a tool or field name, "silence", pressed digits or planning. | `functionCallingDialogue.ts`, 2026-10-29-native-finish-requires-disconnect-validation |
| No premature ending | The call ends while a question, offer, confirmation or transfer is pending, or ends with no goodbye. | 2026-10-29-native-finish-requires-disconnect-validation |
| Questions yield the turn | A tool call uses an answer the caller hasn't given, the agent answers its own question, or it repeats the question after a tool result. | 2026-11-06-native-questions-yield-the-caller-turn, 2026-11-05-native-tool-content-is-caller-dialogue |
| Held drafts stay unheard and needed questions survive | The caller hears a line written with a tool call, or a question from a held draft never reaches the caller. | 2026-11-09-deferred-native-tool-speech |
| No premature transfer promise | The agent says it is connecting the caller before the transfer step or tool runs. | 2026-11-05-native-tool-content-is-caller-dialogue |
| No repeated information | The agent repeats a case number or another fact after a tool result. | 2026-10-26-native-tool-continuations-carry-streamed-speech, 2026-10-28 native calling V4 |

Report these limits with the results:

- A lane that needs `press_button` can't run under upgrade mocks, because
  DTMF and press-button actions are unsupported there. Report it as
  uncovered; see [Mock every scenario's tools](outcomes-v1.md#mock-every-scenarios-tools).
- Text simulations don't measure time to first audio. Holding drafts delays
  speech even on speech-only turns, and live latency is unmeasured, so mark
  it unverified (2026-11-09-deferred-native-tool-speech).
- A lane through a Scheduling or Wait for Response step tests the legacy
  protocol on that step.
- The ask-then-stop, transfer and repetition rules are prompt guidance. A
  passing sample doesn't prove they hold on every call, so report the
  remaining risk.
