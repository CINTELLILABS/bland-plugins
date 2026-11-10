# SIA workspace template

The runtime installs these Git-managed files only for a backend-selected SIA
service-user session. It refreshes template files on each turn while preserving
inputs, reports and runtime history. Existing user-driven Norm workspaces keep
the canonical Norm plugin.

The initial grant permits documentation and read-only snapshot validation. The
backend supplies the selected-call manifest and optional evidence attachments;
missing evidence is a coverage gap. Remote saves, evidence API reads, browser
actions and simulations are not enabled. For nonempty batches, the manual Temporal
workflow launches Norm, waits for the turn to finish, and exports designated memory
notes. It returns the session and turn IDs without publishing agent changes. No
schedule is installed, and no live run has been verified.
