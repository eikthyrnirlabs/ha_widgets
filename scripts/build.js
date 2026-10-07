#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src');
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });

const stripModuleSyntax = (code) =>
  code
    .replace(/^import\s+[\s\S]*?from\s+['"].*?['"];?\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');

const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'));
let bundle = `/*! ha_widgets bundle — generated, do not edit */\n(function () {\n'use strict';\n`;
for (const file of files.sort()) {
  const code = readFileSync(join(srcDir, file), 'utf8');
  bundle += `\n/* --- ${file} --- */\n${stripModuleSyntax(code)}\n`;
}
bundle += `\n})();\n`;

const out = join(outDir, 'ha_widgets.js');
writeFileSync(out, bundle);
console.log(`Wrote ${out} (${bundle.length} bytes) from ${files.length} modules`);
