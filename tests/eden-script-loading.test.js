const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const modRoot = process.env.EDEN_MOD_DIR || path.join(__dirname, "../mods/FertilityExpansion");
const boot = JSON.parse(fs.readFileSync(path.join(modRoot, "boot.json"), "utf8"));
const early = boot.scriptFileList_inject_early;
// The builder discovers regular modules and sorts their paths in the shipped manifest.
const regular = process.env.EDEN_MOD_DIR ? boot.scriptFileList : fs.readdirSync(path.join(modRoot, "modules"))
	.filter(name => name.endsWith(".js"))
	.map(name => `modules/${name}`)
	.filter(name => !early.includes(name))
	.sort();
const source = name => fs.readFileSync(path.join(modRoot, name), "utf8");
// ModLoader 2.101.1's makeScriptNode adds headers and newlines, but no semicolons.
const concatenate = names => names.map((name, index) => `/* twine-user-script #${index}: "${name}" */${source(name)}\n`).join("");

function fixture() {
	const vars = {
		childRecords: [{ childId: 0, pregnancyId: 0, species: "human", bornDate: 100, features: {}, development: { location: "home" } }],
		pregnancies: [{ pregnancyId: 0, carrier: "pc", donor: "Robin" }],
	};
	const handlers = [];
	const window = { SugarCube: { State: { variables: vars } } };
	const context = vm.createContext({
		window,
		document: { getElementById: () => null },
		MutationObserver: class { observe() {} disconnect() {} },
		$: () => ({ on: events => handlers.push(events) }),
	});
	return { context, window, vars, handlers };
}

const predecessors = [
	'window.previousMod = {one: 1, two: 2, three: 3, four: 4}',
	'window.previousMod = Object.freeze({value: true})',
	'window.previousMod = [1, 2, 3]',
	'window.previousMod = "previous mod"',
];

test("concatenated scripts initialize after a mod that omits its final semicolon", () => {
	for (const previous of predecessors) {
		const f = fixture();
		vm.runInContext(concatenate(early), f.context);
		vm.runInContext(`${previous}\n${concatenate(regular)}\nwindow.afterEden = true;`, f.context);
		assert.equal(f.window.afterEden, true);
		assert.equal(f.window.EdenRuntime.isReady(), true);
		for (const api of ["EdenAdult", "EdenAge", "EdenChildData", "EdenTraining", "EdenTraits", "EdenBreeding", "EdenProfileUi", "EdenLLM"]) {
			assert.equal(typeof f.window[api], "object", api);
		}
		assert.ok(f.handlers.some(events => events.includes(":passagedisplay.edenProfile")));
		const eden = { children: { 0: { profile: "keep this saved profile" } } };
		f.window.EdenChildData.syncRegistry(eden);
		assert.equal(eden.children[0].profile, "keep this saved profile");
		assert.equal(eden.children[0].status, "active");
		assert.equal(eden.children[0].dataVersion, 6);
	}
});

test("child data initializes independently when an earlier ordinary script aborts shared execution", () => {
	const f = fixture();
	vm.runInContext(concatenate(early), f.context);
	assert.equal(typeof f.window.EdenChildData.syncRegistry, "function");
	assert.throws(() => vm.runInContext(`throw new Error("neighbor script failed");\n${concatenate(regular)}`, f.context), /neighbor script failed/);
	assert.equal(typeof f.window.EdenChildData.syncRegistry, "function");
	assert.equal(f.window.EdenRuntime.isReady(), false);
	assert.ok(f.window.EdenRuntime.missing().includes("成长"));
	assert.ok(!f.window.EdenRuntime.missing().includes("孩子资料"));
	const eden = { children: { 0: { profile: "saved profile" } } };
	const before = JSON.stringify(eden);
	if (f.window.EdenRuntime.isReady()) f.window.EdenChildData.syncRegistry(eden);
	assert.equal(JSON.stringify(eden), before);
});

test("early child data reads the live State after initialization and after save load", () => {
	const f = fixture();
	delete f.window.SugarCube;
	vm.runInContext(concatenate(early), f.context);
	assert.equal(f.window.EdenChildData.get(0), undefined);
	f.window.SugarCube = { State: { variables: f.vars } };
	assert.equal(f.window.EdenChildData.get(0), f.vars.childRecords[0]);
	const replacement = { ...f.vars.childRecords[0], name: "loaded child" };
	f.window.SugarCube.State.variables = { childRecords: [replacement] };
	assert.equal(f.window.EdenChildData.get(0), replacement);
});

test("every module can be the first script after another mod", () => {
	for (const name of [...early, ...regular]) {
		const f = fixture();
		vm.runInContext(`${predecessors[0]}\n${concatenate([name])}\nwindow.afterEden = true;`, f.context, { filename: name });
		assert.equal(f.window.afterEden, true, name);
		assert.equal(f.window.previousMod.four, 4, name);
	}
});
