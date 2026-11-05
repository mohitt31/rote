# Unguided agent run on real data — 5 November 2026 (IST)

Run on the public demo (https://rote-demo.netlify.app), Gemini 3.1 Flash-Lite on a free-tier, billing-disabled Google project. Numbers below were read back from the app's own actions (`preview-table`, `get-restraint-report`) right after the run.

## The prompt (goal only, no steps named)

> Table `<CDSCO January 2026 import>` is India CDSCO's January 2026 list of drug batches that failed quality tests. Every month my pharmacy buyers need a clean version of this list: batch number, product, only the manufacturer's company name (not its address), which test it failed as a short category, the expiry month as a real date, and who reported it. Do it with Rote's table actions so it can become a monthly pipeline, check your result with validate, and tell me the final output table ID. Keep previews to 5 rows so you stay within the free model's token limit.

The last sentence was added after a first attempt (Gemini 3.5 Flash-Lite) failed on the free tier's 250,000 input-tokens-per-minute limit. It does not describe any step.

## What the agent did

- Chose its own six recorded steps: `regex_extract` (manufacturer), `regex_extract` (failed test), `parse_date` (expiry), `select_columns`, `rename_columns`, `validate`.
- Framework trace for the run: 308,131 input + 1,365 output tokens, 107.3 s; the chat reported 1 min 49 s and 4 failed tool calls along the way (retried by the model).
- Output: 218 rows, columns `batch_number, product, manufacturer_name, failed_test_category, expiry_date, reported_by`.

## Compared with the independent reference (same 218 rows, same order)

| Field | Agent matches reference |
| --- | --- |
| Batch number | 218 / 218 |
| Product | 218 / 218 |
| Manufacturer company name | 218 / 218 after trimming spaces (197 exact; the agent did not normalize whitespace) |
| Expiry month as a date | 218 / 218 |
| Reporter | 215 / 218 against the reporting source (the agent used `str_reporting_source`; 3 differ only by "State lab" vs "State Lab") |
| Failed test as a category | weak: a value for only 46 / 218 rows, mostly the raw phrase after "with respect to"; 45 of those 46 contain the reference category |

## What this shows

Without being told the steps, the model found the right structure for five of the six fields on real government data. It did not produce a usable failed-test category, which a reviewer sees immediately in the output preview. This is the case Rote is built for: the agent's run is a draft. Nothing becomes a pipeline until a person approves a reference, an unseen holdout passes, and the exact version is approved. In Rote's flow the reviewer would correct the categories (or teach that step again) before approving.

This run was not promoted. The approved CDSCO pipeline in the demo is the script-recorded one described in `docs/data-cdsco.md`.
