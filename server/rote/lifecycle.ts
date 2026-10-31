import { defineMachine } from "@agent-native/core/state-machine";
export const pipelineLifecycle = defineMachine({
  id: "rote-pipeline",
  states: ["candidate", "verified", "approved", "retired"],
  initial: "candidate",
  terminal: ["retired"],
  transitions: {
    verify: { from: ["candidate"], to: "verified" },
    promote: { from: ["verified"], to: "approved" },
    retire: { from: ["approved"], to: "retired" },
  },
});
export const runLifecycle = defineMachine({
  id: "rote-run",
  states: ["running", "succeeded", "failed", "drift"],
  initial: "running",
  terminal: ["succeeded", "failed", "drift"],
  transitions: {
    succeed: { from: ["running"], to: "succeeded" },
    fail: { from: ["running"], to: "failed" },
    drift: { from: ["running"], to: "drift" },
  },
});
