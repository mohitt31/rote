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

/** Small files go inline through the typed action, so hosted demos work without storage. */
export const INLINE_MAX_BYTES = 1024 * 1024;
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
