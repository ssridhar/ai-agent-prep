// Validates the curriculum so a typo can't silently break progress tracking.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/data.js"), "utf8"), ctx);
const { CURRICULUM, VIDEOS, PROJECT, INTERVIEW, RESOURCES } = ctx.window;
const TYPES = new Set(["video", "course", "read", "build", "reflect", "practice", "decide"]);

test("6 weeks, 42 consecutive days", () => {
  assert.strictEqual(CURRICULUM.length, 6);
  const days = JSON.parse(JSON.stringify(CURRICULUM.flatMap((w) => w.days.map((d) => d.day))));
  assert.deepStrictEqual(days, Array.from({ length: 42 }, (_, i) => i + 1));
});

test("every task is well formed and ids are unique", () => {
  const ids = new Set();
  for (const w of CURRICULUM) for (const d of w.days) {
    assert.ok(d.tasks.length > 0, `day ${d.day} has no tasks`);
    for (const t of d.tasks) {
      assert.ok(t.id && !ids.has(t.id), `duplicate or missing id ${t.id}`);
      ids.add(t.id);
      assert.ok(TYPES.has(t.type), `${t.id}: bad type ${t.type}`);
      assert.ok(t.title, `${t.id}: no title`);
      if (t.type === "video") assert.ok(VIDEOS[t.video], `${t.id}: unknown video ${t.video}`);
      if (t.url) assert.match(t.url, /^https:\/\//, `${t.id}: url must be https`);
    }
  }
});

test("videos have valid YouTube ids", () => {
  for (const [k, v] of Object.entries(VIDEOS)) assert.match(v.youtubeId, /^[A-Za-z0-9_-]{11}$/, k);
});

test("project milestones point at real milestone tasks", () => {
  const tasks = CURRICULUM.flatMap((w) => w.days.flatMap((d) => d.tasks.map((t) => ({ ...t, day: d.day }))));
  for (const m of PROJECT.milestones) {
    const t = tasks.find((x) => x.milestone === m.id);
    assert.ok(t, `no task for ${m.id}`);
    assert.strictEqual(t.day, m.day, `${m.id} day mismatch`);
  }
});

test("interview + resources are well formed", () => {
  assert.strictEqual(new Set(INTERVIEW.map((q) => q.id)).size, INTERVIEW.length);
  for (const g of RESOURCES) for (const i of g.items) assert.match(i.url, /^https:\/\//);
});
