# Upstream fix found while building Rote (not submitted yet)

**Bug:** promoting a trace to an eval dataset fails on Postgres/PGlite.

`POST /_agent-native/observability/traces/:runId/promote` (and the `promote-trace-eval` action) returned
`500 {"error":"could not determine data type of parameter $2"}` on Rote's local PGlite database
(`@agent-native/core` 0.222.2; the same code is on `main` at `183f0693`, 3 Nov 2026, and in 0.223.0).

**Cause:** `PROMOTED_DATASET_OWNER` in `packages/core/src/observability/store.ts` is
`(user_id = ? OR (? IS NULL AND user_id IS NULL))`. The second placeholder is only compared with
NULL, so Postgres cannot infer its type. The existing unit tests mock the database, so they never
reach Postgres type inference.

**Minimal repro (PGlite):**

```js
await pg.query(
  "SELECT count(*) FROM t WHERE (user_id = $1 OR ($2 IS NULL AND user_id IS NULL))",
  ["a", "a"],
); // ERROR: could not determine data type of parameter $2
await pg.query(
  "SELECT count(*) FROM t WHERE (user_id = $1 OR (CAST($2 AS TEXT) IS NULL AND user_id IS NULL))",
  ["a", "a"],
); // works for both a value and NULL
```

Verified on 4 Nov 2026 with PGlite 0.5.x: the current SQL errors for both `"a"` and `null`; the
cast version returns the expected rows for both.

**Fix:** `agent-native-promote-trace-null-param.patch` (one-line SQL change plus a comment). The
upstream test suite was not run locally. Opening an upstream issue or PR needs Mohit's approval.
