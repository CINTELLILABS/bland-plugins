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

## Rubric (not shipped to the agent)

- **Always:** first call is `get_dashboard_page_context`; ids come from the
  route, never from the user. Uses only `bland_api_get` and `call_bland_api`.
  No fetch scripts, no docs search for these routes, no call to
  `/v2/tools/suggestions` or `/nango/connection/*`. Tool headers are redacted
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
- **Prompt 6:** says snippet create and update cannot go through the API
  tools and that the code is saved in the builder; offers to read snippets and
  re-pin `snippetId` and `snippetVersion` once saved. Never attempts POST
  `/v1/snippets/create`.
- **Fail:** treating `/run`, `/v1/tools/run` or `/v1/resources/<id>/execute`
  as a harmless read with real customer data; retrying an `oauth_path_not_allowed`
  refusal instead of naming the dashboard path; any DELETE without the
  confirm.
