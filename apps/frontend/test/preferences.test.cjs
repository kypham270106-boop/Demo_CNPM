const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/preferences/translations.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, require: createRequire(sourcePath) });
const { translate } = exportsObject;

test('switches the student navigation and settings between English and Vietnamese', () => {
  for (const [vi, en] of [['Cài đặt', 'Settings'], ['Tổng quan', 'Overview'], ['Sáng', 'Light'], ['Tối', 'Dark']]) {
    assert.equal(translate(vi, 'en'), en);
    assert.equal(translate(vi, 'vi'), vi);
    assert.equal(translate(en, 'vi'), vi);
  }
});

test('preserves spacing next to dynamic values', () => {
  assert.equal(translate('Bạn có ', 'en') + 3, 'You have 3');
  assert.equal(translate(' Thử lại ', 'en'), ' Try again ');
});

test('preserves hub names and unknown text', () => {
  assert.equal(translate('Hub Bách Khoa - EV-40', 'en'), 'Hub Bách Khoa - EV-40');
  assert.equal(translate('', 'en'), '');
});

test('every translated UI literal in both portals has an English entry', () => {
  const english = require('../src/preferences/en.json');
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  }
  const files = [...walk(path.resolve(__dirname, '../src/components/common/student')),
    ...walk(path.resolve(__dirname, '../src/components/common/operator')),
    ...walk(path.resolve(__dirname, '../src/preferences'))].filter(file => file.endsWith('.tsx'));
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text.trim().replace(/\s+/g, ' ');
        assert.ok(english[key], `Missing English translation for ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});
