# Upgrade input, state and customer-check evidence

Applies only to outcomes-v1. Read before authoring and freezing the suite.
Keep the source business contract while rebuilding the conversation for useful,
correct calls. Never repair a test failure by weakening the caller or its checks.

## Inventory inputs and resources

List candidate and source variables separately. Identify each consumed variable's
namespace, actual producer and consuming steps/tools: caller request data, native
capture/extraction, prior tool response, dynamic code, environment or secret.
Keep exact physical extraction keys, including casing and spaces. Template path
resolution can differ from the physical key stored in a trace.

List executable scenarios/responsibilities, reachable tools, root and scoped KBs,
external integrations, and environment key names. Distinguish customer-supplied
fixtures from derived synthetic inputs. Never invent account IDs, credentials,
authentication tokens or environment values. Missing ordinary request variables
are candidates for investigation: conditional branches, runtime defaults and
bootstrap/tool producers can supply them. A static occurrence is not proof of a
missing input or correct dataflow ordering. An authoritative absent environment
key is a blocker. Managed pinned simulation sets use the dev environment.

## Preserve customer tests before freezing

Managed runs mount `/workspace/source-requirements.json`, captured once before
authoring. For every source scenario, create exactly one target scenario with
`metadata.migration_source_scenario_id` equal to the source ID. Preserve:

- `request_data`, `tester_persona_prompt`, `input_messages`, `scenario_type`,
  `advanced_instructions`, `max_turns`, and `metadata.capture_script`.
- Effective caller identity: pathway sources use `tester_persona_name ?? name`;
  persona sources use `tester_persona_name || "Test Caller"`. Set the target
  `tester_persona_name` to that identity if renaming the scenario.
- Business assertion type, complete config and `is_required`; target IDs and names
  can differ. Supported checks are LLM_JUDGE, CUSTOM_LLM, VARIABLE_EXTRACTED,
  REGEX_MATCH and STRING_CHECK. Names must still satisfy outcome/conduct/recovery
  category conventions; add independent assertions if necessary.
- Attached evaluation judge IDs and pinned versions as dependencies to verify.

Source NODE_REACHED/NODES_VISITED/TRAVERSAL_MATCH checks describe old topology;
report them as uncovered source checks and design replacement outcome probes.
Do not restore old node IDs merely to pass them. Unsupported required business
checks remain blockers. Every copied business check, including optional checks,
needs a valid scored result on every counted candidate attempt. Optional failures
remain optional; missing execution is not a scored result.

The target simulator does not consume `advanced_instructions`, `input_messages`
or replay/historical caller behavior through its Helix bridge. Copied source
cases that rely on these controls remain unverified and block completion; copying
unused fields does not prove that the original challenge was executed. Do not
remove these controls to pass the gate. Runtime support or an independently
reviewed equivalent caller fixture is required in a later run.

The managed inline-assertion gate cannot verify the separate attached-judge
engine. Such dependencies remain explicitly unverified and block completion;
do not remove or replace them to manufacture a pass. Source tests are read-only.
For standalone upgrades, export the same source baseline before authoring and
report whether independent platform verification is available.

## State evidence contract

Before the first candidate push, add `migration_state_checks` to target scenario
metadata, alongside the source mapping. End the setup turn to freeze the suite.
Use deterministic caller scripts when exact turn checkpoints matter. These are
required assertions against saved engine evidence, not prose judge opinions:

```json
{
  "migration_state_checks": [
    {"id":"captured-name","kind":"capture","variable":"name","expected":"Alice","turn":1},
    {"id":"kept-name","kind":"preserve","variable":"name","expected":"Alice","from_turn":1,"to_turn":2},
    {"id":"corrected-name","kind":"correction","variable":"name","previous":"Alice","expected":"Bob","from_turn":2,"to_turn":3}
  ]
}
```

`capture` optionally accepts `node_id`. `preserve` and `correction` optionally
accept `from_node_id` and `to_node_id` to bind observed steps. Keys are exact
physical keys, not template expressions. Use one capture check for every compiled
extraction key and at least one preservation check on a collected variable.
Exercise cross-step routing, interruptions and resume behavior where applicable.
Include corrections for caller-correctable values and assert downstream business
behavior as well. A correction check requires a caller turn between observations;
it does not establish the semantic truth of what the caller intended.

`preserve` examines every observed snapshot in the span and requires evidence
for each intervening turn. Decision logs carry their actual current node;
variables-only logs cannot prove a node checkpoint. Missing snapshots, malformed
checks or mismatches block acceptance. Observations do not guarantee a final
end-of-turn snapshot. Each scenario supports at most 100 checks; turns are bounded
at 200 and saved variable snapshots at 400. Out-of-bounds evidence is incomplete.

Tool input syntax is `{id, kind:"tool_input", tool, input_path:["field"], expected,
turn}`. Current saved simulation traces do **not** include executed tool arguments,
so this check remains unscored and blocks completion. Do not substitute tool
outputs, inferred prompt intent, or fabricated trace fields. Static input mappings
and business outcome checks are useful evidence but cannot prove executed inputs.
Report this limitation when a requirement depends on direct tool-input proof.

## Diagnose before repairing

Inspect the exact candidate ID, fixtures, environment keys, authentication,
execution errors, assertion results and persisted `turn_details` first. Separate
configuration, authentication, execution, missing-evidence and possible behavior
failures. A failed call alone does not identify the cause. HTTP/tool errors can
also be caused by bad arguments; inspect evidence before choosing a repair.
Only change agent behavior when the trace and business checks support that change.
Fixture changes after freezing require a new upgrade run. After agent changes,
push a new version and rerun the full repeated suite on that exact ID.

## Explain what was built

Report responsibilities and reachable steps, KB scope, tools/integration contracts,
input producers and missing dependencies, intentional conversational changes,
customer-versus-authored test provenance, copied/scored checks, and unverified
lanes. Show per-turn variable **keys and change status**, never caller values,
credentials, raw fixtures, assertion prompts or endpoint secrets. A platform
summary is bounded and may truncate previews; disclose incomplete evidence.
Keep real-call quality metrics separate from simulation/state pass rates.
