import { callAction } from "@agent-native/core/client/hooks";

import { stepSchemas, type StepName } from "../../shared/rote/model";
export function runWorkbenchStep(
  step: StepName,
  inputTableId: string,
  raw: unknown,
) {
  switch (step) {
    case "select_columns":
      return callAction("select-columns", {
        inputTableId,
        params: stepSchemas.select_columns.parse(raw),
      });
    case "rename_columns":
      return callAction("rename-columns", {
        inputTableId,
        params: stepSchemas.rename_columns.parse(raw),
      });
    case "parse_date":
      return callAction("parse-date", {
        inputTableId,
        params: stepSchemas.parse_date.parse(raw),
      });
    case "parse_number":
      return callAction("parse-number", {
        inputTableId,
        params: stepSchemas.parse_number.parse(raw),
      });
    case "normalize_text":
      return callAction("normalize-text", {
        inputTableId,
        params: stepSchemas.normalize_text.parse(raw),
      });
    case "regex_extract":
      return callAction("regex-extract", {
        inputTableId,
        params: stepSchemas.regex_extract.parse(raw),
      });
    case "map_values":
      return callAction("map-values", {
        inputTableId,
        params: stepSchemas.map_values.parse(raw),
      });
    case "filter_rows":
      return callAction("filter-rows", {
        inputTableId,
        params: stepSchemas.filter_rows.parse(raw),
      });
    case "dedupe":
      return callAction("dedupe", {
        inputTableId,
        params: stepSchemas.dedupe.parse(raw),
      });
    case "join":
      return callAction("join", {
        inputTableId,
        params: stepSchemas.join.parse(raw),
      });
    case "group_aggregate":
      return callAction("group-aggregate", {
        inputTableId,
        params: stepSchemas.group_aggregate.parse(raw),
      });
    case "sort":
      return callAction("sort", {
        inputTableId,
        params: stepSchemas.sort.parse(raw),
      });
    case "compute_column":
      return callAction("compute-column", {
        inputTableId,
        params: stepSchemas.compute_column.parse(raw),
      });
    case "split_column":
      return callAction("split-column", {
        inputTableId,
        params: stepSchemas.split_column.parse(raw),
      });
    case "validate":
      return callAction("validate", {
        inputTableId,
        params: stepSchemas.validate.parse(raw),
      });
  }
}
