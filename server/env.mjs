// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// Minimal KEY=VALUE reader (comments and blank lines ignored, optional quotes).
export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trimStart().startsWith("#")) continue;
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}
