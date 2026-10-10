const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const modRoot = process.env.EDEN_MOD_DIR || path.join(__dirname, '../mods/FertilityExpansion');
const htmlPath = process.env.DOL_0512_HTML || path.resolve(__dirname, '../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html');
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : null;
const nativeTest = { skip: html ? false : 'Provide DOL_0512_HTML to test the shipped ModLoader.' };
const boot = JSON.parse(fs.readFileSync(path.join(modRoot, 'boot.json'), 'utf8'));
const early = boot.scriptFileList_inject_early;
const normal = process.env.EDEN_MOD_DIR ? boot.scriptFileList : fs.readdirSync(path.join(modRoot, 'modules'))
 .filter(name => name.endsWith('.js')).map(name => `modules/${name}`).filter(name => !early.includes(name)).sort();
const source = name => fs.readFileSync(path.join(modRoot, name), 'utf8');

// Extract the actual webpack module and methods, rather than approximating the
// loader's sort order, separators or SugarCube's eval execution boundary.
function nativeFunctions() {
 const marker = html.indexOf('makeScriptNode(sc)');
 assert.ok(marker >= 0);
 const start = html.lastIndexOf('eval("', marker) + 5;
 assert.ok(start > 4);
 let end = start + 1;
 while (end < html.length) {
  if (html[end] === '\\') { end += 2; continue; }
  if (html[end] === '"') break;
  end++;
 }
 const moduleSource = JSON.parse(html.slice(start, end + 1));
 const methodStart = moduleSource.indexOf('    makeScriptNode(sc) {');
 assert.ok(methodStart >= 0);
 const methodEnd = moduleSource.indexOf('\n    }', methodStart) + '\n    }'.length;
 const method = moduleSource.slice(methodStart, methodEnd);
 const evalStart = html.indexOf('function evalJavaScript(code,output,data){');
 const evalEnd = html.indexOf('function evalTwineScript(', evalStart);
 assert.ok(evalStart >= 0 && evalEnd > evalStart);
 return { method, evaluate: html.slice(evalStart, evalEnd) };
}

function run(neighbor, before, options = {}) {
 const { method, evaluate } = nativeFunctions();
 const errors = [], hooks = new Map(), nodes = [], handlers = [];
 let combined;
 const document = { getElementById: id => id === 'twine-user-script' ? combined : null,
  createElement: () => ({ setAttribute() {} }),
  createDocumentFragment: () => ({ children: [], appendChild(node) { this.children.push(node); } }) };
 const own = normal.map(name => ({ id: 0, name, content: source(name) }));
 own.push({id: 0, name: 'modules/eden-scope-probe.js', content: 'window.EdenAuditLexical = setup;'});
 const window = {
  modUtils: { getAnyModByNameNoAlias: () => ({bootJson: {scriptFileList: own.map(item => item.name)}, cache: {scriptFileItems: {items: own}}}) },
  modSC2DataManager: { getModLoadController: () => ({addLifeTimeCircleHook: (key, hook) => hooks.set(key, hook)}) }
 };
 const context = vm.createContext({ window, document,
  MutationObserver: class { observe() {} disconnect() {} },
  $: () => ({ on: events => handlers.push(events) }),
  lodash__WEBPACK_IMPORTED_MODULE_2__: { isSafeInteger: Number.isSafeInteger },
  console: { error: message => errors.push(message), warn() {}, log() {} } });
 for (const name of early) vm.runInContext(source(name), context);
 const loader = vm.runInContext(`({${method}})`, context);
 loader.thisWin = { document };
 const other = { id: 0, name: 'audit-neighbor.js', content: neighbor };
 const native = { id: 1, name: 'native.js', content: 'window.nativeInitialized = true; setup.audit = 42; window.auditSetup = setup;' };
 combined = loader.makeScriptNode({ scriptFileItems: { items: [native, ...(before ? [other, ...own] : [...own, other])] } });
 const original = combined.textContent;
 combined.parentNode = {appendChild(fragment) {nodes.push(...fragment.children);}};
 if (options.alter) combined.textContent = options.alter(combined.textContent);
 window.mainStart = function(value) { return {value, receiver: this}; };
 if (options.isolate) {
  for (const hook of hooks.values()) hook.ModLoaderLoadEnd?.();
  if (options.repeat) for (const hook of hooks.values()) hook.ModLoaderLoadEnd?.();
  // Simulate a later LoadEnd hook updating the final DOM before game startup.
  combined.textContent += '\n/* twine-user-script #0: \"late-hook.js\" */;window.auditLateHook = true;';
  const receiver = {};
  const returned = window.mainStart.call(receiver, 42);
  assert.equal(returned.value, 42);
  assert.equal(returned.receiver, receiver);
  if (options.repeat) window.mainStart();
 }
 // SugarCube APIs are lexical bindings, not necessarily window properties.
 vm.runInContext(`window.auditEval = (() => { const setup = {}; ${evaluate}; return evalJavaScript; })();`, context);
 let failure;
 for (const script of [combined, ...nodes]) {
  try { window.auditEval(script.textContent); } catch (error) { failure ??= error; }
 }
 return { window, errors, failure, text: combined.textContent, original, nodes, handlers, count: own.length };
}

test('shipped ModLoader and SugarCube reproduce all seven missing APIs only when the throwing neighbor runs first', nativeTest, () => {
 const code = ';throw new Error("audit predecessor failed");';
 const blocked = run(code, true);
 assert.match(blocked.failure.message, /audit predecessor failed/);
 assert.equal(blocked.window.nativeInitialized, true);
 assert.ok(blocked.text.includes('window.EdenAdult'));
 assert.equal(typeof blocked.window.EdenChildData.syncRegistry, 'function');
 assert.equal(typeof blocked.window.EdenSaveMigration.ensureReady, 'function');
 assert.equal(typeof blocked.window.EdenSaveRecovery.infer, 'function');
 assert.deepEqual(Array.from(blocked.window.EdenRuntime.missing()), ['成长', '天生属性', '培养', '孕期', '成年结算', '通讯录', '人生来信']);
 const loaded = run(code, false);
 assert.match(loaded.failure.message, /audit predecessor failed/);
 assert.equal(loaded.window.EdenRuntime.isReady(), true);
});

test('an error log without a thrown exception does not interrupt Eden in the shipped loader', nativeTest, () => {
 const result = run(';console.error("audit nonfatal diagnostic");', true);
 assert.equal(result.failure, undefined);
 assert.deepEqual(result.errors, ['audit nonfatal diagnostic']);
 assert.equal(result.window.EdenRuntime.isReady(), true);
});


test('isolated scripts survive an earlier exception, preserve SugarCube scope and register UI handlers once', nativeTest, () => {
 const fixed = run(';throw new Error("audit predecessor failed");', true, {isolate: true, repeat: true});
 assert.match(fixed.failure.message, /audit predecessor failed/);
 assert.equal(fixed.window.EdenRuntime.isReady(), true);
 assert.equal(fixed.window.EdenScriptLoader.status(), 'isolated');
 assert.equal(fixed.nodes.length, fixed.count);
 assert.equal(fixed.window.EdenAuditLexical, fixed.window.auditSetup);
 assert.equal(fixed.window.EdenAuditLexical.audit, 42);
 assert.equal(fixed.window.auditLateHook, undefined); // The earlier error still stops the neighbor's shared script.
 assert.equal(fixed.handlers.filter(events => events.includes(':passagedisplay.edenProfile')).length, 1);
 assert.ok(!fixed.text.includes('window.EdenAdult'));
 assert.ok(fixed.text.includes('audit predecessor failed'));
});

test('isolation refuses ambiguous modified or missing source without removing or duplicating scripts', nativeTest, () => {
 for (const alter of [text => text.replace('const dataVersion = 3;', 'const dataVersion = 999;'),
  text => text.replace('"modules/eden-adult.js"', '"missing.js"')]) {
  const result = run(';console.error("audit diagnostic");', true, {isolate: true, alter});
  assert.equal(result.window.EdenScriptLoader.status(), 'failed');
  assert.equal(result.nodes.length, 0);
  assert.equal(result.text, alter(result.original) + '\n/* twine-user-script #0: \"late-hook.js\" */;window.auditLateHook = true;');
 }
});
