import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { scopeFor } from "../server/rote/action-helpers.js";
import { readTable } from "../server/rote/repository.js";

export default defineAction({
  description:
    "Read the Chat app's current navigation state. Basic navigation is already included in <current-screen>; use this action only when you need a fresh read.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async (_, ctx) => {
    const navigation = await readAppState("navigation");

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;
    const selected = await readAppState("rote-selection");
    if (typeof selected?.tableId === "string") {
      const table = await readTable(selected.tableId, scopeFor(ctx));
      screen.table = {
        id: table.id,
        name: table.name,
        columns: table.columns,
        rowCount: table.rowCount,
        sample: table.sample,
      };
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
