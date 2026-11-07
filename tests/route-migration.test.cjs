const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const appRoot = resolve(__dirname, '..');

test('root and health routes live under src/app', () => {
  assert.equal(existsSync(resolve(appRoot, 'src/app/page.tsx')), true);
  assert.equal(
    existsSync(resolve(appRoot, 'src/app/api/health/route.ts')),
    true,
  );
  assert.equal(existsSync(resolve(appRoot, 'app')), false);
});
