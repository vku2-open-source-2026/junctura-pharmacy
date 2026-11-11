// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// Repository hygiene for the OLP FOSS rules: every file that can hold a comment
// states its license, project license files exist, no dependency is bundled.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const COMMENTABLE = /\.(mjs|cjs|js|jsx|ts|tsx|css|html|svg|md|ya?ml|toml|sh|ps1|sql|conf)$/;
const NAMED = new Set([".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", "Dockerfile"]);
const EXEMPT = /^(LICENSE|LICENSES\/)/;

// Tracked plus not-yet-committed files, so the check also guards the first commit.
const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
assert.equal(listed.status, 0, "git ls-files failed: run inside the repository");
const files = [...new Set(listed.stdout.split("\0").filter(Boolean))].filter(existsSync);

let checked = 0;
for (const file of files) {
  assert.ok(!/(^|\/)(node_modules|vendor)\//.test(file), `${file}: bundled dependencies are not allowed; declare them in package.json`);
  if (EXEMPT.test(file) || !(COMMENTABLE.test(file) || NAMED.has(basename(file)))) continue;
  const head = readFileSync(file, "utf8").slice(0, 300);
  // REUSE-IgnoreStart
  assert.ok(head.includes("SPDX-License-Identifier: Apache-2.0"), `${file}: missing SPDX-License-Identifier header`);
  assert.ok(head.includes("SPDX-FileCopyrightText: 2026 Junctura Contributors"), `${file}: missing SPDX-FileCopyrightText header`);
  // REUSE-IgnoreEnd
  if (/\.(mjs|cjs|js)$/.test(file)) {
    const syntax = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    assert.equal(syntax.status, 0, `${file}: syntax`);
  }
  checked++;
}

for (const file of files.filter(f => basename(f) === "package.json")) {
  assert.equal(JSON.parse(readFileSync(file, "utf8")).license, "Apache-2.0", `${file}: license must be Apache-2.0`);
}
const license = readFileSync("LICENSE", "utf8");
assert.ok(license.includes("Version 2.0, January 2004") && license.includes("APPENDIX"), "LICENSE must be the full Apache-2.0 text");
assert.ok(existsSync("LICENSES/Apache-2.0.txt"), "LICENSES/Apache-2.0.txt required by REUSE");
assert.ok(readFileSync("NOTICE", "utf8").includes("Copyright 2026 Junctura Contributors"), "NOTICE attribution");
for (const doc of ["README.md", "CHANGELOG.md", "CONTRIBUTING.md"]) assert.ok(existsSync(doc), `${doc} required`);
console.log(`SPDX headers (${checked} files), license files and dependency hygiene verified`);
