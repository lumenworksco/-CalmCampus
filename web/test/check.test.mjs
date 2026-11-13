import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("scripts/check.mjs passes on the shipped configs and strings", () => {
  execFileSync("node", ["scripts/check.mjs"], { cwd: new URL("..", import.meta.url), stdio: "pipe" });
});
