const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const modRoot = process.env.EDEN_MOD_DIR || path.join(__dirname, '../mods/FertilityExpansion');
const source = fs.readFileSync(path.join(modRoot, 'modules/eden-runtime.js'), 'utf8');
const htmlPath = process.env.DOL_0512_HTML || path.resolve(__dirname, '../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html');
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : null;
const native = html?.match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)?.[1];
const runtime = { skip: native ? false : 'Provide DOL_0512_HTML for the native banner regression.' };

function fixture(code = '') {
 const script = { textContent: code }, macro = {};
 const images = [];
 const skybox = { 0: { isConnected: true }, draws: 0, cssChanges: 0, appendTo() {},
  empty() { return this; }, append() { this.draws++; return this; }, css() { this.cssChanges++; return this; } };
 const context = vm.createContext({ window: {}, Weather: { banner: { skybox } }, Macro: { add(name, definition) { macro[name] = definition; } },
  Image: class { constructor() { images.push(this); } }, $: image => image,
  document: { getElementById: () => script }, MutationObserver: class { observe() {} disconnect() {} } });
 vm.runInContext(source, context);
 return { context, script, skybox, images, macro, api: context.window.EdenRuntime };
}
function bannerSource() {
 const start = native.indexOf('Macro.add("banner", {');
 const end = native.indexOf('\nMacro.add("thermometer",', start);
 assert(start >= 0 && end > start);
 return native.slice(start, end);
}

test('native banner race is reproduced; captured target survives Weather reset and ignores retired DOM', runtime, () => {
 const broken = fixture();
 vm.runInContext(bannerSource(), broken.context);
 broken.macro.banner.handler.call({ output: {} });
 broken.context.Weather.banner = undefined;
 assert.throws(() => broken.images[0].onload(), /skybox/);
 const f = fixture();
 vm.runInContext(f.api.patchSource(bannerSource()), f.context);
 f.macro.banner.handler.call({ output: {} });
 const newSkybox = { ...f.skybox, draws: 0 };
 f.context.Weather.banner = { skybox: newSkybox };
 f.images[0].onload();
 assert.equal(f.skybox.draws, 1);
 assert.equal(newSkybox.draws, 0);
 f.context.Weather.banner = undefined;
 f.images[0].onload();
 assert.equal(f.skybox.draws, 2);
 f.skybox[0].isConnected = false;
 f.images[0].onload();
 assert.equal(f.skybox.draws, 2);
 assert.equal(f.skybox.cssChanges, 2);
});

test('missing banner renderer is harmless and starts no pending image callback', runtime, () => {
 const f = fixture();
 vm.runInContext(f.api.patchSource(bannerSource()), f.context);
 f.context.Weather.banner = undefined;
 assert.doesNotThrow(() => f.macro.banner.handler.call({ output: {} }));
 assert.equal(f.images.length, 0);
});

test('full native source is patched once, parses and reports early installation status', runtime, () => {
 const f = fixture(native);
 assert.equal(f.api.bannerPatchStatus(), 'patched');
 assert.notEqual(f.script.textContent, native);
 assert.equal(f.api.patchSource(f.script.textContent), f.script.textContent);
 new vm.Script(f.script.textContent);
 const changed = 'Macro.add("banner", {handler() { return false; }});';
 assert.equal(f.api.patchSource(changed), changed);
});
