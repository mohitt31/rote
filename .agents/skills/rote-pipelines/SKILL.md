---
name: rote-pipelines
description: Turn a reviewed Rote table transformation into a verified recurring pipeline, or replay an already approved task using named input tables.
metadata:
  internal: true
---

Use the Rote actions listed in AGENTS.md. Transform input tables through the fifteen step actions so the output has recorded lineage. Arbitrary SQL or generated code is not a replayable pipeline.

Create the task with its numeric tolerances before collecting reference examples. Named bindings must point to original imported tables. Use the same binding names for training, holdout and replay. The source output identifies recorded transformation lineage; the reference output is the table the human reviewed, and may be a corrected import.

Ask the human to review and approve a training reference and an independent holdout through `approve-example`. Crystallization freezes the references and tolerances; it reads only training lineage. It substitutes named input references for table IDs; it does not generalize arbitrary dates or business constants.

Call `verify-pipeline` and report its actual pass/fail result. A failed check or example must never be repaired by changing reference data, the comparator or tolerances. Automated model repair is not implemented. Human-facing differences are available on the Tasks screen; holdout rows are excluded from agent tool output.

Request `promote-pipeline` with the exact version ID and hash displayed by `get-task`. The human must approve the specific call. Never grant approval yourself or use a CLI approval override without that approval.

After promotion, `run-task` takes named table IDs and executes without inference. Drift returns no output and requires review; do not silently switch to an agent or report success. Label synthetic examples as samples. A manual sample preparation is not an agent run, and null usage measurements are unknown rather than zero. Only completed, scoped framework traces supply agent metrics; deterministic replay records zero model tokens.
