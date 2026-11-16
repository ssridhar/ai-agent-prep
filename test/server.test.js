// Run with: npm test   (uses Node's built-in test runner, no installs)
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prep-test-"));
process.env.PREP_DATA_DIR = tmp;
const { server } = require("../server.js");
let base;

before(() => new Promise((r) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("serves the app", async () => {
  const r = await fetch(base + "/");
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Agent Platform Prep/);
  for (const f of ["/app.js", "/data.js", "/styles.css"]) assert.strictEqual((await fetch(base + f)).status, 200, f);
});

test("progress starts empty, then round-trips through disk", async () => {
  let r = await fetch(base + "/api/progress");
  assert.deepStrictEqual(await r.json(), { progress: null });
  const body = { version: 1, startDate: "2026-11-16", tasks: { "w1d1-video": { done: true } } };
  r = await fetch(base + "/api/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(tmp, "progress.json"), "utf8")), body);
  r = await fetch(base + "/api/progress");
  assert.deepStrictEqual((await r.json()).progress, body);
});

test("rejects bad input", async () => {
  let r = await fetch(base + "/api/progress", { method: "PUT", body: "not json" });
  assert.strictEqual(r.status, 400);
  r = await fetch(base + "/api/progress", { method: "PUT", body: "[1,2]" });
  assert.strictEqual(r.status, 400);
  r = await fetch(base + "/api/progress", { method: "DELETE" });
  assert.strictEqual(r.status, 405);
});

test("blocks path traversal", async () => {
  const r = await fetch(base + "/..%2fserver.js");
  assert.ok([403, 404].includes(r.status), "got " + r.status);
});
