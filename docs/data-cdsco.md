# Real data: CDSCO "Not of Standard Quality" drug alerts

- Source: Central Drugs Standard Control Organisation (CDSCO), India. Public monthly NSQ drug alert listings at https://cdscoonline.gov.in (no login).
- Months bundled: Jan-2026 (218 records), Feb-2026 (217), Mar-2026 (190), in `shared/rote/cdsco-nsq-2026.json`, values exactly as published.
- Fetched on 4 Nov 2026 with `scripts/fetch-cdsco.ts` (one request per month, 2 s apart) from Mohit's own machine. Each month carries its request URL, fetch time and the SHA-256 of the response body.
- Task in Rote ("CDSCO drug alerts: monthly clean list"): manufacturer name taken from the address, the failed test as a category (first test named in the result text, from a fixed written list), expiry month as a date, and a consistent reporting source. An unknown test name stops the run (`map_values` with `unmatched: "error"`) instead of guessing.
- References for January and February come from `cdscoReference` in `shared/rote/cdsco.ts`, a plain-code implementation of the same written rules that does not use the step engine. They are offered for human review; they are not ground truth beyond those rules.
- Verified in `tests/cdsco.test.ts`: January's recorded steps reproduce January's reference, the crystallized pipeline passes February as holdout, and the March replay (190 rows, 0 model calls) matches the independent reference.
- The January steps are recorded without a model, like the synthetic samples. No agent run on this data is claimed.
