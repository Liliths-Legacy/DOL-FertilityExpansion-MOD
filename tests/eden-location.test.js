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
		createElement() { return { dataset: {} }; },
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
