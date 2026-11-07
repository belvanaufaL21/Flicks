const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const appRoot = resolve(__dirname, '..');
const repositoryRoot = resolve(appRoot, '..');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('app owns non-interactive quality-check scripts and dependencies', () => {
  const appPackage = readJson(resolve(appRoot, 'package.json'));

  assert.equal(appPackage.scripts.lint, 'eslint .');
  assert.equal(appPackage.scripts.test, 'vitest run');
  assert.ok(appPackage.devDependencies.vitest);
  assert.equal(appPackage.devDependencies['eslint-config-next'], '13.5.6');
  assert.equal(appPackage.dependencies['new-flicks'], undefined);
  assert.equal(
    appPackage.devDependencies['@typescript-eslint/eslint-plugin'],
    '^6.21.0',
  );
});

test('app resolves its compatible TypeScript ESLint plugin locally', () => {
  const pluginPath = require.resolve('@typescript-eslint/eslint-plugin', {
    paths: [appRoot],
  });

  assert.equal(pluginPath.startsWith(resolve(appRoot, 'node_modules')), true);
});

test('ESLint uses the TypeScript preset supported by Next 13', () => {
  const eslintConfig = readJson(resolve(appRoot, '.eslintrc.json'));

  assert.equal(eslintConfig.parser, '@typescript-eslint/parser');
  assert.equal(
    eslintConfig.extends.includes('plugin:@typescript-eslint/recommended'),
    true,
  );
  assert.equal(eslintConfig.extends.includes('next/typescript'), false);
});

test('TypeScript resolves application imports from src at ES2022', () => {
  const tsconfig = readJson(resolve(appRoot, 'tsconfig.json'));

  assert.equal(tsconfig.compilerOptions.target, 'ES2022');
  assert.deepEqual(tsconfig.compilerOptions.paths['@/*'], ['./src/*']);
});

test('root package scripts forward to the app without owning dependencies', () => {
  const rootPackage = readJson(resolve(repositoryRoot, 'package.json'));

  assert.equal(rootPackage.scripts.test, 'npm --prefix app test');
  assert.equal(rootPackage.scripts.lint, 'npm --prefix app run lint');
  assert.equal(rootPackage.scripts.build, 'npm --prefix app run build');
  assert.equal(rootPackage.dependencies, undefined);
  assert.equal(rootPackage.devDependencies, undefined);
});
