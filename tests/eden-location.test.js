const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture({ passageName = "Furniture Shop", catalogue = true } = {}) {
	const entries = [];
	const rendered = [];
	let linksGenerated = 0;
	const exitIcon = { matches: () => true, before(entry) { entries.push(entry); } };
	const leave = { previousElementSibling: exitIcon, before() { throw new Error("Entry must precede the exit icon too"); } };
	const passage = {
		querySelector(selector) {
			if (selector === "[data-eden-furniture-entry]") return entries.find(entry => entry.dataset.edenFurnitureEntry);
			if (selector === 'a.link-internal[data-passage="Furniture Shop Catalogue"]') return catalogue ? { textContent: "目录" } : null;
			if (selector === 'a.link-internal[data-passage="Shopping Centre"]') return leave;
			return null;
		},
		append(entry) { entries.push(entry); },
	};
	leave.parentElement = passage;
	const document = {
		querySelector() { return passage; },
		createElement(tagName) { return { dataset: {}, tagName, children: [], append(child) { this.children.push(child); } }; },
	};
	const window = {
		SugarCube: { State: { passage: passageName }, Wikifier: function(entry, source) { rendered.push(source); } },
		Links: { generate() { linksGenerated++; } },
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-location.js"), "utf8"), {
		window, document, $: () => ({ on() {} }),
	});
	return { window, entries, rendered, count: () => linksGenerated };
}

function farmlandFixture({ owned = false } = {}) {
	const nodes = [];
	let linksGenerated = 0;
	const icon = {
		name: "moor-icon",
		matches: selector => selector === "img, .icon",
		before(entry) {
			const oldIndex = nodes.indexOf(entry);
			if (oldIndex !== -1) nodes.splice(oldIndex, 1);
			const iconIndex = nodes.indexOf(this);
			if (iconIndex !== -1) nodes.splice(iconIndex, 0, entry);
			else nodes.push(entry, this);
		},
	};
	const moor = { name: "moor-link", previousElementSibling: icon };
	const meadow = { name: "meadow-link" };
	/* Reproduce Numberify's wrapper. Climbing to the passage child would place Eden at the top. */
	const numberifyWrapper = { parentElement: null };
	const passage = {
		querySelector(selector) {
			if (selector === "[data-eden-farmland-entry]") return nodes.find(node => node.dataset?.edenFarmlandEntry);
			if (selector === 'a.link-internal[data-passage="Meadow"]') return meadow;
			if (selector === 'a[data-passage="Moor"]') return moor;
			return null;
		},
		append(entry) { nodes.push(entry); },
	};
	numberifyWrapper.parentElement = passage;
	moor.parentElement = numberifyWrapper;
	const document = {
		querySelector() { return passage; },
		createElement(tagName) { return { dataset: {}, tagName, children: [], append(child) { this.children.push(child); } }; },
	};
	const window = {
		SugarCube: {
			State: { passage: "Farmland", variables: { farm_stage: 2, eden: { facility: { owned } } } },
			Wikifier: function(entry, source) { entry.source = source; entry.label = owned ? "前往伊甸园" : "查看待售房产"; },
		},
		Links: { generate() { linksGenerated++; } },
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-location.js"), "utf8"), {
		window, document, $: () => ({ on() {} }),
	});
	return { window, nodes, count: () => linksGenerated };
}

test("Chinese catalogue link permits injection and repeated callbacks do not duplicate it", () => {
	const f = fixture();
	f.window.EdenLocationUi.injectFurnitureShopEntry();
	f.window.EdenLocationUi.injectFurnitureShopEntry();
	assert.equal(f.entries.length, 1);
	assert.deepEqual(f.rendered, ["<<edenFurnitureShopEntry>>"]);
	assert.equal(f.count(), 1);
});

test("no upgrade entry on another passage or when shopping catalogue is unavailable", () => {
	for (const options of [{ passageName: "Furniture Shop Papers" }, { catalogue: false }]) {
		const f = fixture(options);
		f.window.EdenLocationUi.injectFurnitureShopEntry();
		assert.equal(f.entries.length, 0);
	}
});

test("Eden entry is placed before the moor group with a blank line below", () => {
	const f = farmlandFixture();
	f.window.EdenLocationUi.injectFarmlandEntry();
	assert.equal(f.nodes[0].dataset.edenFarmlandEntry, "true");
	assert.equal(f.nodes[0].source, "<<edenFarmlandLink>>");
	assert.equal(f.nodes[0].children[0].tagName, "br");
	assert.equal(f.nodes[1].name, "moor-icon");
	assert.equal(f.count(), 1);
});

test("both property states repair an existing entry moved to the bottom without duplicating it", () => {
	for (const owned of [false, true]) {
		const f = farmlandFixture({ owned });
		f.window.EdenLocationUi.injectFarmlandEntry();
		const entry = f.nodes.shift();
		f.nodes.push(entry);
		f.window.EdenLocationUi.injectFarmlandEntry();
		assert.equal(f.nodes[0], entry);
		assert.equal(f.nodes[1].name, "moor-icon");
		assert.equal(f.nodes.filter(node => node.dataset?.edenFarmlandEntry).length, 1);
		assert.equal(entry.label, owned ? "前往伊甸园" : "查看待售房产");
	}
});
