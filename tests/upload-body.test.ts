import { H3 } from "h3";
import { it, expect } from "vitest";

import { readBoundedUpload } from "../server/rote/upload-body.js";
it("preserves multipart boundaries while bounding a real upload stream", async () => {
  const app = new H3();
  app.post("/upload", async (e) => {
    const data = await readBoundedUpload(e, 1024),
      file = data.get("file") as File;
    return { name: file.name, text: await file.text() };
  });
  const body = new FormData();
  body.set("file", new File(["x\n1\n"], "sample.csv", { type: "text/csv" }));
  const response = await app.request("/upload", { method: "POST", body });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ name: "sample.csv", text: "x\n1\n" });
});
it("rejects oversized chunked multipart bodies and incorrect content types", async () => {
  const app = new H3();
  app.post("/upload", async (e) => {
    await readBoundedUpload(e, 50);
    return "unexpected";
  });
  const form = new FormData();
  form.set("file", new File(["x".repeat(100)], "large.csv"));
  const req = new Request("http://localhost/upload", {
    method: "POST",
    body: form,
  });
  expect((await app.fetch(req)).status).toBe(413);
  expect(
    (await app.request("/upload", { method: "POST", body: "plain" })).status,
  ).toBe(415);
});
