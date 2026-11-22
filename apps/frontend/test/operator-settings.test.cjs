const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter, Routes, Route } = require('react-router-dom');

// Render the real components without a browser. Only API effects and the preference
// provider are replaced; each render supplies the account's current preferences.
let preferences = { theme: 'light', language: 'vi' };
const handlers = { ts: require.extensions['.ts'], tsx: require.extensions['.tsx'], css: require.extensions['.css'] };
function compile(module, filename) {
  if (filename.endsWith('PreferencesContext.tsx')) {
    module.exports = { usePreferences: () => ({
      preferences, loading: false, saving: false, error: false,
      reload() {}, save: async () => {},
      t: text => translate(text, preferences.language),
    }) };
    return;
  }
  if (filename.endsWith(path.join('services', 'api.ts'))) {
    module.exports = { __esModule: true, default: {} };
    return;
  }
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
}
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
require.extensions['.css'] = () => {};
let OperatorDashboard, MobilityHubManagement, translate;
try {
  ({ translate } = require('../src/preferences/translations.ts'));
  OperatorDashboard = require('../src/components/common/operator/Dashboard/OperatorDashboard.tsx').default;
  MobilityHubManagement = require('../src/components/common/operator/Management/MobilityHubManagement.tsx').default;
} finally {
  for (const [extension, handler] of Object.entries(handlers)) {
    if (handler) require.extensions['.' + extension] = handler;
    else delete require.extensions['.' + extension];
  }
}

function render(route, Component = OperatorDashboard) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [route] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/operator/:page?', element: React.createElement(Component) }))));
}
function checked(markup, name, value) {
  return [...markup.matchAll(/<input\b[^>]*>/g)].some(([tag]) =>
    tag.includes(`name="${name}"`) && tag.includes(`value="${value}"`) && tag.includes('checked=""'));
}

test('direct Operator settings route renders the English dark-mode settings', () => {
  preferences = { theme: 'dark', language: 'en' };
  const markup = render('/operator/settings');
  assert.match(markup, /id="preferences-title">Settings<\/h1>/);
  assert.match(markup, /Appearance/);
  assert.match(markup, /Language/);
  assert.ok(checked(markup, 'theme', 'dark'));
  assert.ok(checked(markup, 'language', 'en'));
  assert.doesNotMatch(markup, /This management area is not available yet/);
});

test('Operator settings can render Vietnamese and light-mode preferences', () => {
  preferences = { theme: 'light', language: 'vi' };
  const markup = render('/operator/settings');
  assert.match(markup, /id="preferences-title">Cài đặt<\/h1>/);
  assert.match(markup, /Giao diện/);
  assert.match(markup, /Ngôn ngữ/);
  assert.ok(checked(markup, 'theme', 'light'));
  assert.ok(checked(markup, 'language', 'vi'));
});

test('Operator overview applies English to the content as well as the menu', () => {
  preferences = { theme: 'dark', language: 'en' };
  const markup = render('/operator');
  assert.match(markup, /System overview/);
  assert.match(markup, /Monitor and manage your Smart E-Mobility Hub network/);
  assert.match(markup, /Recent reservations/);
});

test('Hub management translates the table while preserving names and separate notes', () => {
  preferences = { theme: 'light', language: 'en' };
  const markup = render('/operator/hubs', MobilityHubManagement);
  assert.match(markup, />Mobility hub name<\/th>/);
  assert.match(markup, />Notes<\/th>/);
  assert.match(markup, /Mobility Hub Bách Khoa/);
  assert.match(markup, /Hub tại khuôn viên trường Đại học Bách Khoa/);
});
