import { runMigrations } from "@agent-native/core/db";
import { registerIdentityColumns } from "@agent-native/core/org";

import { migrations } from "../db/migrations.js";
registerIdentityColumns([
  {
    table: "rote_runs",
    column: "approved_by",
    emailChange: "retain",
    offboard: "retain",
    reason: "Immutable historical approval attribution, not an access grant.",
  },
]);
export default runMigrations(migrations, { table: "rote_migrations" });
