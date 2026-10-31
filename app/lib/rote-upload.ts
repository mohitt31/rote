import { appPath } from "@agent-native/core/client/api-path";
// File protocol; table data still flows through typed actions.
export async function uploadRoteFile(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(appPath("/rote-upload"), {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  if (!response.ok)
    throw Error("Upload failed. Use CSV/XLSX up to 5 MiB on the local server.");
  const result = (await response.json()) as { uploadId: string };
  return result.uploadId;
}
