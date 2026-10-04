const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const modules = path.join(__dirname, "../mods/FertilityExpansion/modules");
const runtimePath = process.env.DOL_0512_HTML || path.resolve(__dirname, "../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html");
function nativeSource() {
	if (!fs.existsSync(runtimePath)) return null;
	const source = fs.readFileSync(runtimePath, "utf8").match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1];
	const headers = [...source.matchAll(/\/\* twine-user-script #\d+: "([^"]+)" \*\//g)];
	return ["00-time-constants.js", "datetime.js", "pregnancy-records.js"].map(name => {
		const index = headers.findIndex(header => header[1].endsWith("\\" + name));
		assert.ok(index >= 0, `Native ${name} missing`);
		return source.slice(headers[index].index + headers[index][0].length, headers[index + 1]?.index ?? source.length);
	}).join("\n");
}
const native = nativeSource();
const actualRuntime = { skip: native ? false : "Set DOL_0512_HTML for native integration tests" };

function fixture(vars = {}, useNative = false) {
	const window = {
		SugarCube: { State: { variables: vars } }, C: { npc: {} },
		Time: { year: 2026, month: 6, monthDay: 1 },
		DateTime: class {
			constructor(timestamp) {
				const dates = { 0: { year: 1, month: 1, day: 1 }, 1: { year: 2026, month: 3, day: 1 }, 100: { year: 2026, month: 5, day: 31 } };
				if (!dates[timestamp]) throw new Error("Unknown test date");
				Object.assign(this, dates[timestamp]);
			}
		},
	};
	const context = vm.createContext({ window, V: vars });
	if (useNative) {
		vm.runInContext(native, context);
		context.Time = window.Time;
	}
	for (const name of ["eden-age", "eden-child-data", "eden-traits"]) {
		vm.runInContext(fs.readFileSync(path.join(modules, `${name}.js`), "utf8"), context);
	}
	return { vars, window, context, api: window.EdenChildData };
}

function record(childId, fields = {}) {
	return { childId, pregnancyId: 0, species: "human", gender: "f", bornDate: 100,
		identical: null, features: {}, development: { location: "home" }, ...fields };
}
function pregnancy(fields = {}) {
	return { pregnancyId: 0, carrier: "pc", donor: "Robin", conceivedDate: 1, deliveredDate: 100,
		awareOfCarrier: ["pc"], awareOfDonor: [], ...fields };
}
const json = value => JSON.parse(JSON.stringify(value));

test("zero IDs work and invalid IDs never alias the first record", () => {
	const child = record(0);
	const f = fixture({ childRecords: [child], pregnancies: [pregnancy()] });
	assert.equal(f.api.get(0), child);
	assert.equal(f.api.get("0"), child);
	for (const id of [null, undefined, "", " ", false, true, [], {}, -1, 0.5, NaN, "00", "0.0", " 0", "1e0", "__proto__", "constructor"]) {
		assert.equal(f.api.get(id), undefined, String(id));
	}
	assert.equal(f.api.pregnancyOf(child), f.vars.pregnancies[0]);
	assert.equal(f.api.hasId(0), true);
});

test("legacy composite keys stay exact; new arrays take priority over stale legacy data", () => {
	const old = { childId: "pc|Robin|0", type: "human", location: "home" };
	const f = fixture({ children: { "pc|Robin|0": old } });
	assert.equal(f.api.get("pc|Robin|0"), old);
	assert.equal(f.api.get("constructor"), undefined);
	assert.deepEqual(json(f.api.entries()).map(([id]) => id), ["pc|Robin|0"]);
	f.vars.childRecords = [];
	assert.equal(f.api.get("pc|Robin|0"), undefined);
	assert.equal(f.api.entries().length, 0);
});

test("enumeration separates born children, eggs, unborn fetuses and removed records without renumbering", () => {
	const children = [record(0), record(1, { species: "hawk", bornDate: null }),
		record(2, { bornDate: null, pregnancyId: 1 }), record(3, { bornDate: null, pregnancyId: 2 }),
		record(4, { childId: 20 }), null];
	const f = fixture({ childRecords: children, pregnancies: [pregnancy(), pregnancy({ deliveredDate: null }), pregnancy({ carrier: "cleared" })] });
	assert.deepEqual(json(f.api.entries()).map(([id]) => id), ["0", "1"]);
	for (const [scope, ids] of [["born", ["0"]], ["egg", ["1"]], ["unborn", ["2"]], ["all", ["0", "1", "2"]]]) {
		assert.deepEqual(json(f.api.entries({ scope })).map(([id]) => id), ids);
	}
	assert.equal(f.api.phaseOf(children[3]), "removed");
	assert.equal(children[2].childId, 2);
	assert.throws(() => f.api.entries({ scope: "unexpected" }));
});

test("parent identity and awareness come from the linked pregnancy; adopted date zero is valid", () => {
	const child = record(0, { development: { adoptedDate: 0 } });
	const f = fixture({ childRecords: [child], pregnancies: [pregnancy()] });
	assert.deepEqual(json(f.api.parentsOf(child)), { mother: "pc", father: "Robin", motherKnown: true, fatherKnown: false });
	assert.equal(f.api.isAdopted(child), true);
	assert.deepEqual(json(f.api.parentsOf({ mother: "Robin", father: "pc", fatherKnown: true })), { mother: "Robin", father: "pc", motherKnown: false, fatherKnown: true });
	child.pregnancyId = null;
	assert.equal(f.api.parentsOf(child).mother, null);
});

test("location changes write into native development and preserve all other rearing data", () => {
	const child = record(0, { development: { location: "home", interactionsTotal: 25 } });
	const egg = record(1, { species: "hawk", bornDate: null });
	const unborn = record(2, { bornDate: null });
	const f = fixture({ childRecords: [child, egg, unborn], pregnancies: [pregnancy()] });
	assert.equal(f.api.setLocation(child, "eden_home"), true);
	assert.equal(child.development.location, "eden_home");
	assert.equal(child.development.interactionsTotal, 25);
	assert.equal(Object.hasOwn(child, "location"), false);
	assert.equal(f.api.setLocation(egg, "tower"), true);
	assert.equal(f.api.setLocation(unborn, "eden_home"), false);
	assert.deepEqual(json(f.api.entries({ location: "eden_home" })).map(([id]) => id), ["0"]);
	const old = { type: "human", location: "home" };
	assert.equal(f.api.setLocation(old, "eden_home"), true);
	assert.equal(old.location, "eden_home");
});

test("registry adds player offspring and adopted world children, skips unborn and retains missing historical records", () => {
	const children = [record(0), record(1, { species: "hawk", bornDate: null }),
		record(2, { bornDate: null }), record(3, { pregnancyId: 1, development: { adoptedDate: 0 } }), record(4, { pregnancyId: 1 })];
	const retained = { childId: "0", profile: "已有简介", status: "released", innate: { appearance: 86 }, training: { knowledge: 95 } };
	const eden = { children: { 0: retained, missing: { profile: "历史记录" } } };
	const f = fixture({ eden, childRecords: children, pregnancies: [pregnancy(), pregnancy({ carrier: "Alex", donor: "Robin" })] });
	f.api.syncRegistry(eden);
	assert.deepEqual(Object.keys(eden.children).sort(), ["0", "1", "3", "missing"]);
	assert.equal(eden.children[0], retained);
	assert.equal(retained.profile, "已有简介");
	assert.equal(retained.status, "released");
	assert.equal(eden.children[1].childId, "1");
	const snapshot = JSON.stringify(eden);
	f.api.syncRegistry(eden);
	assert.equal(JSON.stringify(eden), snapshot);
});

test("legacy registration, dates, eggs and twin grouping still work", () => {
	const children = {
		old: { type: "wolfgirl", mother: "pc", father: "Robin", born: { year: 2026, month: "May", day: 31 }, features: { identical: "litter" } },
		egg: { type: "hawk", mother: "pc", eggTimer: 0, born: { year: 2026, month: "May", day: 31 } },
	};
	const f = fixture({ children });
	const eden = { children: {} };
	f.api.syncRegistry(eden);
	assert.deepEqual(Object.keys(eden.children).sort(), ["egg", "old"]);
	assert.equal(f.api.ageDays(children.old), 1);
	assert.equal(f.api.ageDays(children.egg), 0);
	assert.equal(f.api.identicalGroup(children.old), "litter");
	assert.equal(f.api.typeOf(children.old), "wolfgirl");
	assert.equal(f.window.EdenAge.inferBodyForm(children.old), "humanoid");
});

test("growth age uses calendar days and honors transfer reset without aging an egg or fetus", () => {
	const child = record(0);
	const f = fixture({ childRecords: [child], pregnancies: [pregnancy()] });
	assert.equal(f.api.ageDays(child), 1);
	const growth = {};
	assert.equal(f.window.EdenAge.resetGrowthAge(growth), true);
	assert.equal(f.api.ageDays(child, growth), 0);
	f.window.Time.monthDay = 5;
	assert.equal(f.window.EdenAge.getAgeDays(child, growth), 4);
	child.bornDate = null;
	assert.equal(f.api.ageDays(child, growth), 0);
	child.species = "hawk";
	assert.equal(f.api.ageDays(child, growth), 0);
	assert.equal(f.api.bornOf(child), null);
	assert.equal(f.api.serialDay({ year: 2026, month: "February", day: 30 }), null);
});

test("native species and monster traits select the correct growth and body form", () => {
	const f = fixture();
	for (const [species, monster, gender, type, inferred, body] of [
		["hawk", "monster", "f", "harpy", "bird", "humanoid"],
		["hawk", "normal", "f", "hawk", "bird", "beast"],
		["wolf", "monster", "f", "wolfgirl", "wolf", "humanoid"],
		["wolf", "monster", "m", "wolfboy", "wolf", "humanoid"],
		["wolf", "normal", "m", "wolf", "wolf", "beast"],
	]) {
		const child = record(0, { species, gender, features: { monster } });
		assert.equal(f.api.typeOf(child), type);
		assert.equal(f.window.EdenAge.inferSpecies(child), inferred);
		assert.equal(f.window.EdenAge.inferBodyForm(child), body);
	}
	assert.equal(f.window.EdenAge.inferSpecies(record(0, { features: { beastTransform: "fox" } })), "fox");
});

test("identical group zero shares trait bases while separate litters stay separate", () => {
	const children = [record(0, { identical: 0 }), record(1, { identical: 0 }), record(2, { identical: 0, pregnancyId: 1 })];
	const eden = { children: {}, settings: { maturityDays: 90 } };
	const f = fixture({ childRecords: children, pregnancies: [pregnancy(), pregnancy()], eden, NPCNameList: ["Robin"] });
	f.api.syncRegistry(eden);
	f.window.EdenTraits.syncAll(eden, f.api.collection(), f.vars);
	assert.equal(f.api.isIdentical(children[0]), true);
	assert.deepEqual(json(eden.children[0].innate.base), json(eden.children[1].innate.base));
	assert.notEqual(eden.children[0].innate.groupKey, eden.children[2].innate.groupKey);
	assert.equal(eden.children[0].innate.namedParentAppearanceFloor, true);
	assert.ok(eden.children[0].innate.appearance >= 60);
	const innate = eden.children[0].innate;
	f.window.EdenTraits.syncRecord(eden.children[0], children[0], 0, f.vars);
	assert.equal(eden.children[0].innate, innate);
});

test("existing migrated traits remain unchanged and later siblings reuse their bases", () => {
	const children = [record(0, { identical: 0 }), record(1, { identical: 0 })];
	const eden = { children: {}, settings: { maturityDays: 90 } };
	const f = fixture({ childRecords: children, pregnancies: [pregnancy()], eden });
	f.api.syncRegistry(eden);
	f.window.EdenTraits.syncRecord(eden.children[0], children[0], 0, f.vars);
	eden.children[0].innate.groupKey = "legacy-group-that-was-preserved";
	const previous = JSON.stringify(eden.children[0].innate);
	f.window.EdenTraits.syncAll(eden, f.api.collection(), f.vars);
	assert.equal(JSON.stringify(eden.children[0].innate), previous);
	assert.deepEqual(json(eden.children[1].innate.base), json(eden.children[0].innate.base));
});

test("new trait generation finds the stored NPC's physique without legacy parentList", () => {
	const child = record(0);
	const f = fixture({ childRecords: [child], pregnancies: [pregnancy({ donor: "random_carrier" })], storedNPCs: { random_carrier: { npc: { description: "muscular man" } } } });
	const traits = f.window.EdenTraits.generateInnate(0, child, f.vars);
	assert.equal(traits.fitnessSource.kind, "recordedNpc");
	assert.equal(traits.fitnessSource.description, "muscular man");
	assert.equal(traits.fitnessSource.parentName, "random_carrier");
});

test("genetic parent zero is retained when generating descendant traits", () => {
	const children = [record(0), record(1)];
	const eden = { children: {}, settings: { maturityDays: 90 } };
	const f = fixture({ childRecords: children, pregnancies: [pregnancy()], eden });
	f.api.syncRegistry(eden);
	eden.children[0].childId = 0;
	f.window.EdenTraits.syncRecord(eden.children[0], children[0], 0, f.vars);
	eden.children[1].geneticParentId = 0;
	f.window.EdenTraits.syncRecord(eden.children[1], children[1], 1, f.vars);
	assert.equal(eden.children[1].innate.inheritedFrom, "0");
	assert.equal(eden.children[1].innate.fitnessSource.kind, "edenParent");
});

test("load and undo resolve current State records without saving copies or a legacy mirror", () => {
	const original = record(0);
	const f = fixture({ childRecords: [original], pregnancies: [pregnancy()] });
	const collection = f.api.collection();
	assert.equal(collection[0], original);
	collection[0].name = "改名";
	assert.equal(f.vars.childRecords[0].name, "改名");
	assert.equal(Object.hasOwn(f.vars, "children"), false);
	const replacement = record(0, { name: "重载后" });
	f.window.SugarCube.State.variables = { childRecords: [replacement], pregnancies: [pregnancy()] };
	assert.equal(f.api.get(0), replacement);
	assert.equal(f.api.collection()[0], replacement);
});

test("actual 0.5.12 DateTime preserves calendar aging across midnight and handles timestamp zero", actualRuntime, () => {
	const child = record(0);
	const f = fixture({ childRecords: [child], pregnancies: [pregnancy()] }, true);
	child.bornDate = new f.window.DateTime(2026, 5, 31, 23, 59, 59).timeStamp;
	f.window.Time.date = new f.window.DateTime(2026, 6, 1, 0, 0, 1);
	assert.deepEqual(json(f.api.bornOf(child)), { year: 2026, month: "May", day: 31 });
	assert.equal(f.api.ageDays(child), 1);
	assert.equal(vm.runInContext("childAgeOf(V.childRecords[0])", f.context), 0);
	child.bornDate = 0;
	assert.deepEqual(json(f.api.bornOf(child)), { year: 1, month: "January", day: 1 });
	assert.equal(f.api.phaseOf(child), "born");
});

test("actual native world and location queries agree with the access layer", actualRuntime, () => {
	const children = [record(0), record(1, { species: "hawk", bornDate: null }), record(2, { bornDate: null, pregnancyId: 1 })];
	const f = fixture({ childRecords: children, pregnancies: [pregnancy(), pregnancy({ deliveredDate: null })] }, true);
	assert.deepEqual(json(f.api.entries()).map(([id]) => Number(id)), json(vm.runInContext("getBornChildren().map(child => child.childId)", f.context)));
	f.api.setLocation(children[1], "tower");
	assert.deepEqual(json(f.api.entries({ location: "tower" })).map(([id]) => Number(id)), json(vm.runInContext('getChildrenAt("tower").map(child => child.childId)', f.context)));
});
