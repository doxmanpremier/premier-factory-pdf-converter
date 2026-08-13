import assert from "node:assert/strict";
import test from "node:test";

test("requires login and renders the login screen", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const redirect = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get("location"), "http://localhost/login");

  const response = await worker.fetch(
    new Request("http://localhost/login", { headers: { accept: "text/html" } }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /Factory Quote Converter/);
  assert.match(html, /name="username"/);
  assert.match(html, /name="password"/);
});
