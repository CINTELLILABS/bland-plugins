# Release follow-ups

- [ ] Custom configuration directory smoke test. Owner: PR author, coordinating
  with a maintainer who has a connected Bland account. Before releasing 2.2.1,
  run `/bland:status --check` with the plugin installed in a custom Claude
  configuration directory, switch the API URL and restart, then verify the
  startup banner and MCP target. Repeat in the default profile and confirm that
  neither profile changes the other's settings. Offline fixture tests cover the
  CLI and hook; marketplace installation and live MCP reconnection are pending.
