const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture(variables = {}, functions = {}) {
	const window = { SugarCube: { State: { variables } }, ...functions };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-safehouse.js"), "utf8"), { window });
	return window.EdenSafehouseCompat;
}

test("0.5.11 uses the native binding check even when legacy states differ", () => {
	assert.equal(fixture({ feetuse: "bound" }, { breakableSoftBinding: () => false }).canUnbind(), false);
	assert.equal(fixture({}, { breakableSoftBinding: () => true }).canUnbind(), true);
});

test("0.5.8 without breakableSoftBinding follows the original bedroom rules", () => {
	assert.equal(fixture({}).canUnbind(), false);
	for (const state of [{ leftarm: "bound" }, { rightarm: "bound" }, { feetuse: "bound" }, { worn: { feet: { name: "ankle cuffs" } } }]) {
		assert.equal(fixture(state).canUnbind(), true);
	}
	assert.equal(fixture({ worn: { feet: { name: "ball and chain" } } }).canUnbind(), false);
});

test("0.5.8 calls its existing arm check with any", () => {
	let argument;
	assert.equal(fixture({}, { pcAreArmsBound: arm => { argument = arm; return true; } }).canUnbind(), true);
	assert.equal(argument, "any");
});

test("missing game state is safe", () => {
	assert.equal(fixture(undefined).canUnbind(null), false);
});
