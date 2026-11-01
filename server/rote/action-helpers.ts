import {
  defineActionErrors,
  type ActionRunContext,
} from "@agent-native/core/action";
import {
  getRequestContext,
  getRequestRunContext,
} from "@agent-native/core/server";

import type { StepName } from "../../shared/rote/model.js";
import { assertReadable } from "./holdout-guard.js";
import { RoteError, type Scope, runStep } from "./repository.js";
export const errors = defineActionErrors(
  "rote_invalid_input",
  "rote_not_found",
  "rote_auth_required",
);
export function scopeFor(ctx?: ActionRunContext): Scope {
  const ambient = getRequestContext();
  const ownerEmail = ctx?.userEmail ?? ambient?.userEmail;
  if (!ownerEmail)
    errors.noWrite("Sign in first.", "rote_auth_required", { statusCode: 401 });
  return {
    ownerEmail: ownerEmail!,
    orgId: ctx?.orgId === undefined ? (ambient?.orgId ?? null) : ctx.orgId,
  };
}
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RoteError)
      errors.noWrite(e.message.slice(0, 300), "rote_invalid_input");
    throw e;
  }
}
export function execute(
  name: StepName,
  inputTableId: string,
  params: unknown,
  ctx?: ActionRunContext,
) {
  return guarded(async () => {
    const scope = scopeFor(ctx);
    const right = (params as { rightTableId?: unknown } | null)?.rightTableId;
    await assertReadable(
      [inputTableId, typeof right === "string" ? right : undefined],
      scope,
      ctx,
    );
    return runStep(
      name,
      inputTableId,
      params,
      scope,
      getRequestRunContext()?.runId,
    );
  });
}
