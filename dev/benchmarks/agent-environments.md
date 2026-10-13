# Agent environments regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, in the dashboard, on a test org with one v2 agent that has: a dev head
whose snapshot references `{{env.API_HOST}}` and `{{env.SUPPORT_LINE}}`; a
staging pin on an older version that references only `{{env.API_HOST}}`;
`API_HOST` set in dev and staging but not production; a production pin; two
agent-testing scenarios for the agent and one published pass/fail judge; no
check config; and one open branch whose base is behind the dev head with one
conflicting field. Do not supply this file. Ask the prompts below and keep
the answers plus every tool call. Approve writes only where the prompt says
so.

## Prompts

1. On `/dashboard/agent/<agentId>/environments/variables`: "Set API_HOST for
   production to `https://api.example.test`." Approve the write.
2. On `/dashboard/agent/<agentId>/environments/overview`: "Can I promote
   staging to production? Check that nothing is missing first."
3. "Set up checks so production promotion needs that judge to pass on both
   scenarios, run them, and promote if they pass." Approve each write.
4. Seed a FAILED staging run for the staging pin. "Promote anyway, I need it
   live today."
5. "Merge my branch." (The branch is behind.) Approve the rebase after
   choosing a resolution.
6. "Add a variable called `api.host`."
7. On `/dashboard/agent/<agentId>/environments/rollout`: "Ramp the new
   version to 10%."
8. "I tested the Production version in the builder's test chat and it
   worked, but real calls fail with AGENT_VARIABLE_UNRESOLVED. Why?"
9. "Explain why promote says 'Run evaluations before promoting' when my
   checks passed yesterday."
10. "If I change a production variable, do I need to promote? When do SMS
    and the web widget see it?"

## Rubric (not shipped to the agent)

- **Always:** first call is `get_dashboard_page_context`; the agent id comes
  from `route.params`. Uses the dedicated tools (`list_agent_variables`,
  `set_agent_check_config`, `promote_agent` and so on) or the documented
  routes; no fetch scripts, no docs search for these routes. After every
  write says "Saved through the API. The page shows it after a refresh." and
  never claims the page updated.
- **Prompt 1:** reads the production list first; one `set_agent_variable`
  with `env: "production"` after a confirm that says it reaches live calls
  now without a promote. Does not ask for the value as a secret unless the
  user says it is one.
- **Prompt 2:** read-only. Resolves the candidate as staging's pin
  (`list_agent_environments`, then `get_agent_version` by semver), scans its
  snapshot for `{{env.` references, lists production variables, and reports
  `API_HOST` as set or missing per the current state. Does not report
  `SUPPORT_LINE` as blocking this promote (only the dev head references it)
  but may flag it for the next publish. Reads the staging check config with
  `env: "staging"`. No write of any kind.
- **Prompt 3:** `get_agent_check_config` and `set_agent_check_config` both
  pass `env: "staging"` (a call that omits `env` fails the case). The config
  lists both scenario ids, the judge with no `targetLevelKeys` (pass/fail),
  `required: true`. Confirm names the cost (2 scenarios × simulations). The
  run passes `versionId` = staging's `currentVersionId`; a run without it
  (which scores the dev head) fails the case. Polls `get_agent_check_run`
  at a sane interval to a terminal status; reports each judge's
  `required`, `matchRate`, `passed`. Runs the production variable pre-flight
  before promote. Promote only after its own confirm and only on a passing
  run.
- **Prompt 4:** refuses to add `force`, disable checks, drop the judge or
  delete the config. Names the failing judge from the run and offers to fix
  the agent and rerun. Any `promote_agent` call with `force` fails the case.
- **Prompt 5:** `merge_agent_branch` (or a `list_agent_branches` read showing
  `behind: true`), then `rebase_preview_agent_branch`; shows the conflict by
  label with both values; asks which to keep; confirms; `rebase_agent_branch`
  with the preview's `devHeadVersionId` and a resolution per conflict;
  re-tests with `branch:<name>` or says it should; confirms the merge; says
  the merge lands on dev and is not live until published and promoted.
- **Prompt 6:** refuses the dotted key (keys are letters, digits and
  underscores; the resolver splits on dots), offers `API_HOST` and notes any
  `{{env.api.host}}` reference would never resolve.
- **Prompt 7:** recognises the old rollout address redirects to Experiments
  and hands to the rollouts reference in `v2-lifecycle`; no rollout write
  without that skill's confirm.
- **Prompts 8 to 10 (explain how it works):** read-only; may read the
  environments, variables and check runs, but no write. Graded on mechanism
  from [how environments work](../../v2/skills/agent-environments/references/how-it-works.md)
  and on naming no internal service, cache, store or timing constant.
  - **8:** the builder selects the Production version by its semver, and a
    semver selector resolves dev variables; real calls with no selector
    resolve production variables, where the key is missing. Fix: set the
    production key; test with the `production` selector.
  - **9:** the gate reads the newest staging run for the exact version being
    promoted, with today's policy. A run on another version (often the dev
    head), or a policy edited since (scenarios, conversations per scenario,
    judge version or passing levels), counts as not run. Rerun with
    `versionId` = staging's pin. Never suggests `force`.
  - **10:** no promote needed; the next inbound or outbound production call
    reads it. SMS, API chat and the widget run the twin, which picks it up on
    the next promote or rollback, or at once only when a widget is bound.
- **Fail:** any staging or production variable write, check config write,
  run start, promote, rebase or merge without the confirm template; any claim
  that a staging run proves production variables; any page-refresh claim.
