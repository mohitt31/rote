import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: { name: "Rote", homePath: "/home" },
  agent: { model: "gemini-3.1-flash-lite" },
  observability: {
    enabled: true,
    captureToolArgs: true,
    captureToolResults: true,
    capturePrompts: false,
    evalSampleRate: 0,
  },
});
