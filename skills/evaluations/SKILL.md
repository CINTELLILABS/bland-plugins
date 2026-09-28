---
name: evaluations
description: Use when creating or calibrating Bland evaluation judges, configuring test cases and attached judges, running or interpreting evaluations and simulations, or investigating failed, partial, or inconclusive scores. Distinguishes voice agents, evaluation judges, test scenarios, saved call cohorts, and asynchronous run results.
---

# Evaluation work

Use API operations and workspace code, not dashboard clicks, to build and run
evaluations. Read [workflow and evidence](references/workflows.md) and the
[API map](references/api.md) for the chosen task. Follow
[API identity and permission rules](../api-workspace/references/api.md).

Choose the right object before writing:

- A **voice agent** is the system being tested.
- An **evaluation judge** scores one dimension, with a versioned rubric.
- A **test scenario** defines a simulated caller and its inputs. It may attach
  evaluation judges; it is not the same as a saved list of real calls.
- A **test config** is a reusable cohort of existing call IDs.
- A **run** is one execution with fixed inputs and judge snapshots.

Required loop:

1. Define the observable pass condition and needed evidence.
2. Fetch/create the judge, then edit its version—not the identity object.
3. Calibrate on known examples, including a failure and an inconclusive case.
4. Attach the intended judge version to the scenario or run.
5. Estimate supported billed operations and stay within the user's scope.
6. Persist the returned operation ID, follow status, fetch result details.
7. Separate a valid failing verdict from execution failure or missing evidence.
8. Read back changes and request UI synchronization if the host supports it.

Do not claim “passed” from a 202, a finished spinner, or `COMPLETE` alone. State
which version was tested, which judge version scored it, the denominator, and
unscored cases. Text evaluations cannot establish audible interruption timing.

For live audio evidence read [voice testing](../v2-testing/references/voice.md).
For agent-testing inline assertions and traces read
[v2 testing](../v2-testing/SKILL.md). These are related but distinct surfaces;
do not substitute one surface's status names or request fields for another's.
