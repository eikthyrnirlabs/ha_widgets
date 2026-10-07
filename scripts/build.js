#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src');
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });

let version = '0.0.0';
try {
  version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || version;
} catch {
  // keep default
}
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    .toString()
    .trim();
} catch {
  commit = '';
}
const buildStamp = commit ? `${version}+${commit}` : version;
const cacheTag = commit ? `${version}-${commit}` : version;

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

let bundle = `/*! ha_widgets bundle — generated, do not edit */\n/*! version: ${buildStamp} */\n(function () {\n'use strict';\nconsole.log('[ha_widgets] version ${buildStamp}');\n`;
for (const file of ordered) {
  const mod = modules.get(file);
  bundle += `\n/* --- ${file} --- */\n${stripModuleSyntax(mod.code)}\n`;
}
bundle += `\n})();\n`;

const out = join(outDir, 'ha_widgets.js');
writeFileSync(out, bundle);
console.log(`Wrote ${out} (${bundle.length} bytes)`);
console.log(`Module order: ${ordered.join(' -> ')}`);
console.log(`Version: ${buildStamp}`);

// Update demo pages to reference the bundle with a cache-busting query
const demoPages = [
  join(root, 'demo', 'buttons', 'index.html'),
  join(root, 'demo', 'dial', 'index.html'),
];
for (const page of demoPages) {
  let html = readFileSync(page, 'utf8');
  const re = /(\.\.\/\.\.\/dist\/ha_widgets\.js)(\?v=[\w.\-]+)?/;
  if (!re.test(html)) {
    console.warn(`No bundle script tag found in ${page}`);
    continue;
  }
  html = html.replace(re, `$1?v=${cacheTag}`);
  writeFileSync(page, html);
  console.log(`Stamped ${page} with ?v=${cacheTag}`);
}
