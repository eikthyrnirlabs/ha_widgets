import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist', 'ha_widgets.js');

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
};

check('build produces dist/ha_widgets.js', () => {
  execFileSync('node', [join(root, 'scripts', 'build.js')], { stdio: 'inherit' });
  assert.ok(existsSync(dist));
});

check('bundle contains no ESM import/export syntax', () => {
  const code = readFileSync(dist, 'utf8');
  assert.ok(!/\bimport\s+.*\bfrom\b/.test(code), 'found import statement');
  assert.ok(!/^export\s/m.test(code), 'found export statement');
});

check('bundle parses as a script', () => {
  execFileSync('node', ['--check', dist]);
});

check('bundle registers the custom element', () => {
  const code = readFileSync(dist, 'utf8');
  assert.ok(code.includes("customElements.define('hold-confirm-toggle'"));
  assert.ok(code.includes('customCards'));
});

check('source modules parse as ESM', () => {
  const src = join(root, 'src');
  for (const f of ['helpers.js', 'hold-confirm-toggle.js']) {
    execFileSync('node', ['--check', join(src, f)]);
  }
});

console.log(`\n${passed} bundle checks passed`);
