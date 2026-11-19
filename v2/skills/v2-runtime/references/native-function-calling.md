# Native function calling

How a v2 agent runs its tools, how to tell whether native function calling is
on for an agent, and what changes when it is. The authoring rules for prompts
and tool definitions are in
[the native function calling rules](../../v2-migration/references/native-tool-calling-v1.md);
they apply to every native agent, not only to upgrades.

## Contents

- [Two tool protocols](#two-tool-protocols)
- [Is it on for this agent](#is-it-on-for-this-agent)
- [Which steps use it](#which-steps-use-it)
- [What to do differently](#what-to-do-differently)
- [Test it](#test-it)

## Two tool protocols

- **Native function calling.** The step's tools go to the dialogue model as
  function definitions. The model replies with speech, one tool call with its
  arguments, or both. No separate extraction pass fills tool inputs. Three
  built-in tools are offered by default: `press_button`, `wait` and `finish`.
  The rules list the turns where `finish` and `wait` are withheld.
- **Legacy protocol.** The model answers in a text action format, and tool
  inputs are extracted in a separate pass. v1 pathways and personas use this
  protocol unless Bland enrolls a pathway in its pilot.

The protocol is chosen when the call is set up.

## Is it on for this agent

Read the snapshot of the version that takes the traffic: the production pin,
the staging pin, a number's dev or branch version, or the exact version a test
names. `get_latest_agent_version` (or `GET /v2/agents/<id>/versions/latest`)
reads the dev or branch head. `GET /v2/agents/<id>/versions/<semver>` reads a
published version, such as the semver an environment pins.

| `settings.nativeToolCalling` | Meaning |
|---|---|
| `true` | The version opted in to native function calling. |
| absent, `false` or any other value | The version runs the legacy protocol. |

The marker belongs to the platform, not to the author:

- A version save keeps the marker of the version it builds on (the head of the
  timeline or branch) and drops any value the request sends. You cannot turn
  native calling on or off by editing the snapshot. Do not add or remove the
  key, and do not report an edit to it as a change.
- An agent created with `POST /v2/agents` or the `create_agent` tool is
  enrolled. Its first saved version gets the marker, and every later save
  inherits it. The onboarding starter agent and agents generated from a
  website are enrolled the same way.
- An agent that the platform creates together with its first version is not
  enrolled: the `/v2/agents` pathway, persona and widget migration routes,
  pathway translation and as-is imports. Its versions keep the legacy
  protocol. A hand migration that pushes into an agent made with
  `create_agent` is enrolled, so its first pushed version runs natively.
- An upgrade run that the platform starts with native calling stamps every
  candidate it saves.

Two more conditions apply at call time:

- The call must carry the agent identity that the platform resolves itself:
  outbound calls placed with `agent_id`, inbound calls to a number bound to
  the agent, test chats, API chat and texts. Request data and caller-supplied
  variables cannot turn native calling on.
- An organization-level platform setting can run every v2 agent in the org
  natively, or keep every one on the legacy protocol, whatever the marker
  says. The API does not expose this setting. When behavior contradicts the
  marker, say that this override can be the cause instead of guessing.

## Which steps use it

On a native call, a step uses native function calling only when its compiled
node runs in tool mode: the node has tools, or the agent runs every node in
tool mode. `scheduling` and `waitForResponse` steps always keep the legacy
protocol, even on a native call. A lane that runs through them is not evidence
of native behavior.

## What to do differently

Follow [the rules](../../v2-migration/references/native-tool-calling-v1.md)
whenever the version that runs carries the marker. The ones that most often
break an existing agent:

- **One tool call per response.** Write two-tool sequences as ordered steps.
- **Text sent with a custom tool call is not spoken.** The next response must
  carry anything the caller still needs to hear. Put "one moment" lines in the
  tool's filler speech, not in the prompt.
- **Describe moments, not actions.** Write "end the call after the goodbye",
  not "use Finish". Remove JSON, bracket and action-format instructions from
  prompts.
- **Schemas.** An `input_schema` needs an object root. `$ref`, `$defs`,
  `oneOf`, `anyOf`, `allOf`, `not`, `if`/`then`/`else` and related keywords
  make the runtime drop the whole tool. Every `required` name must be a
  declared property.
- **Names.** Letters, digits, `_` and `-`, at most 64 characters, unique
  without regard to case. Do not name a custom tool `wait`, `finish` or
  `press_button`; it replaces the built-in.
- **Arguments.** `input_schema` holds only values the caller supplies. Fill
  system values through `{{variable}}` placeholders or schema defaults.
- **Offered tools only.** Name a tool only in the prompt of a step it is
  attached to. A call to a tool the step was not offered does not run.

## Test it

Text simulations, test chats, API chat and texts run the protocol of the
version they use, so a text simulation of a native version exercises native
calling. Freeze the checks in the
[simulation table](../../v2-migration/references/native-tool-calling-v1.md#check-native-behavior-in-simulations)
into the suite, and read each native lane's transcript and engine trace.
Text runs do not measure time to first audio; mark latency as unverified.
