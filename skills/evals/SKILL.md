---
name: evals
description: "Use when the user wants to evaluate, score, grade or judge Bland calls or simulations: build evaluation judges and their rubric levels, calibrate a judge against known calls, assemble weighted judge panels, attach judges to v2 agent test scenarios, estimate and run evaluation runs, read per-call verdicts and evidence, score every production call automatically, or set up post-call dispositions."
license: MIT
---

# Evaluations

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

Measure v2 agent quality with evaluations. A measurement the user cannot trust is worse than none, so calibration and evidence discipline matter as much as running scores.

Read and follow the [evaluations skill](../../v2/skills/evaluations/SKILL.md): judge identity versus rubric versions, calibration, scenario attachments, simulation scoring, call-cohort runs, and execution versus verdict failures. Steps are in [workflows](../../v2/skills/evaluations/references/workflows.md), routes in the [API map](../../v2/skills/evaluations/references/api.md), and the model in [how it works](../../v2/skills/evaluations/references/how-it-works.md). Post-call outputs on every call (outcomes, fields, verdicts) are [dispositions](../../v2/skills/dispositions/SKILL.md).

Simulating a caller against an agent is [v2 testing](../../v2/skills/v2-testing/SKILL.md). Evaluations are the persistent judge layer that scores simulations and real calls.

## Guardrails

- Estimate before every run and quote the atom count and cost in the confirmation. Runs are billed.
- Never attach an uncalibrated judge to a panel that gates a decision. Report calibration as N of M agreements, with the disagreements quoted.
- Scores come only from fetched run results. Name the judge version behind every number.
- Do not re-grade a call yourself to correct a judge. Fix the rubric and run it again.
