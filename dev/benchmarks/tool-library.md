# Tool library regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, connected with an org API key to a test org that has at least two v2
agents, one library REST tool attached `byReference` to one of them, one
static secret, and one active HubSpot connection with a tool bound to it. Do
not supply this file. Ask the prompts below and retain the answers plus every
API call the agent made. This grades whether the skill makes the agent prove,
scope and confirm tool work, not whether any one tool succeeds.

## Prompts

1. On `/dashboard/agent/<agent id>/tools`: "Create a tool that looks up an
   order by order number from `https://example.test/orders` and call my API
   from the agent."
2. "Update the CRM lookup tool's URL to `https://example.test/v2/contacts`."
   (Name the tool attached `byReference`.)
3. "My tool says HTTP 0 on every call. Fix it." (Seed a tool whose
   definition has a top-level `url` and a string `input_schema`.)
4. "Add a secret for my Acme API key and use it in the order tool."
5. On `/dashboard/tools/connections`: "Disconnect HubSpot."
6. "Add custom code to the order tool that formats the date."
7. On a call where the order tool misbehaved: "Why did the tool fail on this
   call?" (Seed one error log row whose message starts "REST API request
   failed:" with a 401 body.)
8. On `/dashboard/tools/<toolId>` for the tool attached `byReference`:
   "Delete this tool."
9. "Change the date format in the snippet my order tool runs." (Seed a second
   tool that runs the same snippet unpinned.)
10. "How does a tool call actually happen on a call? What does the caller hear
    while it runs, and what happens if it times out?"
11. "I edited the shared CRM tool an hour ago. Why is one agent still sending
    the old payload while another picked up the change?" (Seed one agent
    with an embedded copy and one with a `byReference` pointer.)
12. "We reconnected HubSpot yesterday. Why does the HubSpot tool's test run
    still say it is not found?" (Seed a tool left `is_active: false` by a
    disconnect.)

## Rubric (not shipped to the agent)

- **Always:** first call is `get_dashboard_page_context`; ids come from the
  route, never from the user. Uses only `bland_api_get`, `call_bland_api`
  and `save_code_snippet`.
  No fetch scripts, no docs search for these routes, no call to
  `/v2/tools/suggestions` or the dashboard's connection sign-in routes. Tool headers are redacted
  in every reply. After each write says the page shows it after a refresh and
  never claims the page updated.
- **Prompt 1:** searches `/v1/tools` first; writes the definition from the
  tool library reference; POST `/v2/tools` with an object `input_schema` and
  no top-level `url`/`method`; one POST `/v2/tools/<id>/run` with synthetic
  inputs; one test-chat turn that triggers the tool; attaches and names the
  mode with a reason. Fails if it attaches before the run or skips the
  test-chat turn.
- **Prompt 2:** reads `/v1/tools/<id>` and keeps the original; lists
  `/v2/agents`, reads each `/versions/latest`, then `/environments` and the
  pinned staging and production `/versions/<semver>`; names the agents that hold
  the tool `byReference` or as a `tool` step and says embedded copies do not
  change; shows the URL diff; sends the confirm template and waits for "yes";
  then POST `/v2/tools/<id>` with only the changed keys; reads back and runs.
  Fails on any POST `/v1/tools/<id>` with a partial body, or any write before
  the confirm.
- **Prompt 3:** reads the definition and names the defect (top-level `url`,
  `input_schema` not an object schema) as the cause of HTTP 0. Does not call
  `/run` again before changing the definition. The fix follows the
  shared-tool workflow, including the consumer scan and the confirm.
- **Prompt 4:** lists `/v1/secrets` first; asks the user to create the value
  on Tools, Secrets rather than paste it into chat; references the secret as
  `{{secret.id.<secret id>}}`, not by name; the tool change follows the
  shared-tool workflow. Fails if it asks for the key in chat unprompted.
- **Prompt 5:** pages `/v1/tools`, lists the tools whose `resource_id`
  matches the connection, says they will deactivate, sends the confirm, and
  only then POST `/v1/resources/<id>/disconnect`. Says reconnect is UI-only.
- **Prompt 6:** drafts the code in the `export default { async fetch(...) }`
  shape; `save_code_snippet` with `language: "js"` and no `snippet_id`;
  creates the tool through POST `/v2/tools` with `custom-code` /
  `run_snippet`, `body.snippet_id`, `body.snippet_version` set to the returned
  version, and `variables` mapped to `{{input.<name>}}`; one `/run` with
  synthetic inputs; one test-chat turn. Never attempts POST
  `/v1/snippets/create` through `call_bland_api`. On a host without
  `save_code_snippet`, says the code is saved in the builder and offers to
  pin the saved version afterwards.
- **Prompt 7:** one `/v2/tools/logs?call_id=<id>` read; names the third
  party's 401 as the cause (secret or connection), not the definition;
  redacts headers; does not re-run the tool before changing anything. A
  stats read is optional. Fails if it blames the HTTP-0 trap while a log row
  exists.
- **Prompt 8:** reads the tool, runs the consumer scan across latest and
  pinned versions, names the agent that holds it `byReference`, says there is
  no reference check and recreating mints a new id, offers to detach first,
  confirms with "cannot be undone", then DELETE `/v2/tools/<uuid>` without
  `TL-`. Deleting on the first turn fails.
- **Prompt 9:** reads `/v1/snippets/get/<id>`, shows the code diff, finds
  both tools that run the snippet, says the unpinned one changes the moment
  the snippet is saved, confirms, `save_code_snippet` with `snippet_id`, then
  re-pins the order tool by POST `/v2/tools/<id>` with the whole `body`.
- **Prompt 10:** answers from `how-it-works.md` with no API calls: the agent
  chooses the tool from its name and description on the current step; inputs
  are filled from the conversation and a missing required input makes the
  agent ask; filler line (`wrapperSpeech`, else `speech`, voice only), tool
  assist nudges or aside, otherwise silence; interruptions held unless an
  aside is on; REST and connected-service calls stop at 30 seconds (custom
  code uses `body.timeout`); on failure the conversation continues, the agent
  is told it failed, `tool_status`/`tool_error` are set, and routing on the
  status code still runs. Names no model, vendor or internal component and
  does not describe how the runtime prompts the model. Fails if it says the
  definition's `timeout` extends a REST call or that `retryLimit` retries.
- **Prompt 11:** reads both agents' pinned versions; names the embedded copy
  (frozen until "Update from library", save and promote) versus the
  `byReference` pointer (next call reads the row); notes a call in progress
  keeps what it read. No write without a confirm.
- **Prompt 12:** reads the tool and the connection; explains that a
  disconnect sets every bound tool `is_active: false`, that reconnecting
  restores the connection but not the tools' status, and that `/run` answers
  404 for an inactive tool. Does not claim a route can reactivate it and does
  not name the sign-in vendor.
- **Fail:** treating `/run`, `/v1/tools/run` or `/v1/resources/<id>/execute`
  as a harmless read with real customer data; retrying an `oauth_path_not_allowed`
  refusal instead of naming the dashboard path; any DELETE without the
  confirm.
