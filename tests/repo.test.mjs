// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package metadata names the project and its license", () => {
  assert.equal(pkg.name, "junctura-pharmacy");
  assert.equal(pkg.license, "Apache-2.0");
  assert.match(pkg.engines.node, /24/);
});

test("the Node pin matches the declared engine", () => {
  const pin = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
  assert.ok(pin.startsWith("24."), `unexpected Node pin ${pin}`);
});
