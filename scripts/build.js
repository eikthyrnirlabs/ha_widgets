#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src');
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'));

const modules = new Map();
for (const file of files) {
  const code = readFileSync(join(srcDir, file), 'utf8');
  const deps = [];
  const re = /from\s+'\.\/(.+?)'/g;
  let m;
  while ((m = re.exec(code))) deps.push(m[1]);
  modules.set(file, { code, deps });
}

const ordered = [];
const visited = new Set();
const visiting = new Set();
function visit(file) {
  if (visited.has(file)) return;
  if (visiting.has(file)) {
    throw new Error(`Circular dependency detected: ${file}`);
  }
  visiting.add(file);
  const mod = modules.get(file);
  if (!mod) throw new Error(`Unknown module: ${file}`);
  for (const dep of mod.deps) {
    const resolved = dep.endsWith('.js') ? dep : `${dep}.js`;
    if (modules.has(resolved)) visit(resolved);
  }
  visiting.delete(file);
  visited.add(file);
  ordered.push(file);
}
for (const file of files) visit(file);

const stripModuleSyntax = (code) =>
  code
    .replace(/^import\s+[\s\S]*?from\s+['"].*?['"]\s*;?\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n');

let bundle = `/*! ha_widgets bundle — generated, do not edit */\n(function () {\n'use strict';\n`;
for (const file of ordered) {
  const mod = modules.get(file);
  bundle += `\n/* --- ${file} --- */\n${stripModuleSyntax(mod.code)}\n`;
}
bundle += `\n})();\n`;

const out = join(outDir, 'ha_widgets.js');
writeFileSync(out, bundle);
console.log(`Wrote ${out} (${bundle.length} bytes)`);
console.log(`Module order: ${ordered.join(' -> ')}`);
