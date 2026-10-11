const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("nursery markers follow actual links and hide only outlines when configured", () => {
	const window = { SugarCube: { State: { variables: { options: { eden: {} } } } } };
	vm.runInNewContext(fs.readFileSync("mods/FertilityExpansion/modules/eden-nursery-ui.js", "utf8"), {
		window, document: {}, $: () => ({ on() {} }),
	});
	const action = { disabled: false, closest: () => null };
	let links = [];
	const classes = new Set();
	const hotspot = { dataset: { edenHotspotChild: "0" }, hidden: false,
		classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } };
	const activity = { dataset: { edenActivityChild: "0" }, querySelectorAll: () => links };
	const root = { querySelectorAll: selector => selector.startsWith(".eden-child-activity") ? [activity] : [hotspot] };
	window.EdenNurseryUi.sync(root);
	assert.equal(hotspot.hidden, true, "statement-only activity has no marker");
	links = [action];
	window.EdenNurseryUi.sync(root);
	assert.equal(hotspot.hidden, false, "a native or stage action enables the marker");
	window.SugarCube.State.variables.options.eden.showHallHotspots = false;
	window.EdenNurseryUi.sync(root);
	assert.equal(hotspot.hidden, false, "bubble and click area remain visible");
	assert.ok(classes.has("eden-child-outline-hidden"));
	window.SugarCube.State.variables.options.eden.showHallHotspots = true;
	window.EdenNurseryUi.sync(root);
	assert.ok(!classes.has("eden-child-outline-hidden"));
	action.disabled = true;
	window.EdenNurseryUi.sync(root);
	assert.equal(hotspot.hidden, true);
	links = [];
	window.EdenNurseryUi.sync(root);
	assert.equal(hotspot.hidden, true, "removing an action clears its marker");
});
