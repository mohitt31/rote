import { it, expect } from "vitest";

import { groupRuns, signatureOf } from "../server/rote/restraint.js";

it("groups agent runs by the steps they called, ignoring branch order", () => {
  expect(signatureOf(["join", "parse_number", "parse_number"])).toBe(
    signatureOf(["parse_number", "join", "parse_number"]),
  );
  const logs = [
    { traceRunId: "r1", action: "parse_number" },
    { traceRunId: "r1", action: "join" },
    { traceRunId: "r2", action: "join" },
    { traceRunId: "r2", action: "parse_number" },
    { traceRunId: "r3", action: "dedupe" },
  ];
  const traces = new Map([
    ["r1", { tokensIn: 1000, tokensOut: 10, cost: 199, durationMs: 4000 }],
    ["r2", { tokensIn: 2000, tokensOut: 20, cost: 100, durationMs: 6000 }],
  ]);
  const groups = groupRuns(logs, traces, [
    {
      taskId: "t1",
      taskName: "Payouts",
      version: 2,
      actions: ["parse_number", "join"],
    },
  ]);
  expect(groups).toHaveLength(2);
  const [top, rest] = groups;
  expect(top!.agentRuns).toBe(2);
  expect(top!.tracedRuns).toBe(2);
  expect(top!.tokensIn + top!.tokensOut).toBe(3030);
  expect(top!.costUsd).toBeCloseTo(0.0299);
  expect(top!.coveredBy).toEqual([
    { taskId: "t1", taskName: "Payouts", version: 2 },
  ]);
  // Untraced runs count as runs but contribute no invented numbers.
  expect(rest!.agentRuns).toBe(1);
  expect(rest!.tracedRuns).toBe(0);
  expect(rest!.tokensIn).toBe(0);
  expect(rest!.coveredBy).toEqual([]);
});
