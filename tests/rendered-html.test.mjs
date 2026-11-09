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
  assert.match(html, /Premier Convertor\/PM Tool/);
  assert.match(html, /name="username"/);
  assert.match(html, /name="password"/);
});




test("deployment includes the Project Management application and matching asset version", async () => {
  const {readFile}=await import("node:fs/promises");
  const {createHash}=await import("node:crypto");
  const js=await readFile(new URL("../dist/client/pm-bundle.js",import.meta.url));
  const css=await readFile(new URL("../dist/client/pm-bundle.css",import.meta.url));
  assert.ok(js.length>1000);
  assert.ok(css.length>1000);
  const version=createHash("sha256").update(js).update(css).digest("hex").slice(0,16);
  const manifest=await readFile(new URL("../worker/pm-assets.ts",import.meta.url),"utf8");
  assert.ok(manifest.includes(version));
});
