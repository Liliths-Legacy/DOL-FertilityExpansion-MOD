const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const modules = path.join(__dirname, "../mods/FertilityExpansion/modules");
const read = name => fs.readFileSync(path.join(modules, name + ".js"), "utf8");
const runtimePath = process.env.DOL_0512_HTML || path.resolve(__dirname, "../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html");
const native = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8").match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1] : null;
const actualRuntime = { skip: native ? false : "Set DOL_0512_HTML to test the actual 0.5.12 pregnancy functions" };
function nativeFile(source, name) {
	const headers = [...source.matchAll(/\/\* twine-user-script #\d+: "([^"]+)" \*\//g)];
	const i = headers.findIndex(h => h[1].endsWith("\\" + name));
	assert.ok(i >= 0, name);
	return source.slice(headers[i].index + headers[i][0].length, headers[i + 1]?.index ?? source.length);
}
function bridge(source) {
	const script = { textContent: source };
	const context = vm.createContext({ window: {}, document: { getElementById: () => script } });
	vm.runInContext(read("eden-birth-bridge"), context);
	return { context, script, api: context.window.EdenBirthBridge };
}
function fixture({ species = "human", capacity = 6 } = {}) {
	const vars = { eden: { children: {}, facility: { owned: true, capacity } }, childRecords: [], pregnancies: [], storedNPCs: {}, NPCList: [],
		settings: { humanPregnancyMonths: 3, wolfPregnancyWeeks: 4, birdPregnancyWeeks: 4, npcPregnancyEnabled: true, nnpcPregnancyEnabled: true, baseNpcPregnancyChance: 100, pregnancyType: "realistic", darkSkinChance: 0 },
		pregnancyStats: { humanChildren: 0, wolfChildren: 0, hawkChildren: 0, playerChildren: 0, npcChildren: 0, npcChildrenUnrelatedToPlayer: 0, npcTotalBirthEvents: 0 },
		location: "eden_home", consensual: 1, player: { sex: "f" }, naturalhaircolour: "brown", eyeselect: "blue", bodysize: 2,
		sexStats: { vagina: { menstruation: {} } }, pendingPregnancies: { vagina: null, anus: null }, cumLoads: { vagina: [], anus: [] }, earSlime: { event: "none" },
	};
	const macros = {};
	const context = vm.createContext({ V: vars, T: {}, clone: structuredClone, structuredClone, console,
		setup: { pregnancy: { typesEnabled: ["human", "wolf", "wolfboy", "wolfgirl", "hawk", "harpy"], infertile: [], canBePregnant: [], canImpregnatePlayer: [], randomAlwaysKeep: [] } },
		ConstantsLoader: { init: value => value }, C: { npc: {} }, Skin: { color: { natural: "light" } }, State: { random: () => 0 },
		random: (min = 0) => min, weightedRandom: (...choices) => choices[0][0],
		DefineMacro: (name, fn) => { macros[name] = fn; }, EventSystem: { isSlotTaken: () => true },
		npcHasStrapon: () => false, condomState: () => "none", playerChastity: () => false,
	});
	context.window = context;
	context.SugarCube = { State: { variables: vars } };
	context.document = { getElementById: () => ({ textContent: "function giveBirthToChildren() {}" }) };
	vm.runInContext(`Math.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
		Array.prototype.random = function() { return this[0]; };
		Array.prototype.pushUnique = function(...values) { for (const value of values) if (!this.includes(value)) this.push(value); };`, context);
	vm.runInContext(read("eden-birth-bridge"), context);
	const patched = context.EdenBirthBridge.patchSource(native);
	assert.notEqual(patched, native);
	for (const file of ["00-time-constants.js", "datetime.js", "pregnancy-constants.js", "pregnancy-records.js", "child-generator.js", "eligibility.js", "conception.js", "pregnancy-lifecycle.js", "pregnancy-macros.js", "story-functions.js"]) vm.runInContext(nativeFile(patched, file), context);
	context.Time = { date: new context.DateTime(2, 1, 1), year: 2, month: 1, monthDay: 1, days: 366, hour: 8 };
	for (const name of ["eden-child-data", "eden-breeding", "eden-traits"]) vm.runInContext(read(name), context);
	// The adult is index 0; deliberately use a pregnancy at index 0 for that adult,
	// then test conception/delivery at the subsequent stable pregnancy indexes.
	const parentalPregnancy = context.pushPregnancyRecord({ carrier: "pc", donor: "Robin", donorSpecies: species, conceivedDate: 0, deliveredDate: 0, awareOfCarrier: ["pc"], awareOfDonor: ["pc"] });
	context.pushChildRecord({ pregnancyId: parentalPregnancy, species: ["wolfgirl", "wolfboy"].includes(species) ? "wolf" : species === "harpy" ? "hawk" : species,
		gender: "f", bornDate: 0, name: "同名", features: { ...(species !== "human" ? { monster: "monster" } : {}), hairColour: "red", eyeColour: "green", skinColour: "dark" }, development: { location: "eden_contacts" } });
	context.EdenChildData.syncRegistry(vars.eden);
	const record = vars.eden.children[0];
	record.adult = { settled: true, pregnancy: null, birthEvents: 0 };
	record.bodyForm = "humanoid";
	context.EdenTraits.syncAll(vars.eden, context.EdenChildData.collection());
	vars.NPCList[0] = { fullDescription: "Eden child 0", edenChildId: 0, pregnancy: 0, type: species, gender: "f", penis: "vagina", penissize: 2 };
	const api = context.EdenBreeding;
	function conceive() { return macros.npcPregnancyRoll("Eden child 0", "human", "pc", "human", "vagina", "deep", vars.location, 1, 0); }
	function advanceTo(timestamp) {
		const date = new context.DateTime(timestamp);
		Object.assign(context.Time, { date, year: date.year, month: date.month, monthDay: date.day, days: Math.floor(timestamp / 86400) });
	}
	function due() { advanceTo(context.getDueDate(vars.pregnancies[record.adult.pregnancy.pregnancyId])); api.syncAll(vars.eden); }
	function deliver() { return api.deliver(vars.eden, context.EdenChildData.collection(), 0); }
	return { context, vars, eden: vars.eden, api, record, macros, conceive, advanceTo, due, deliver };
}

test("early bridge preserves the legacy helper and patches once", () => {
	const f = bridge("function giveBirthToChildren() {}");
	assert.match(f.script.textContent, /window.giveBirthToChildren = giveBirthToChildren/);
	assert.equal(f.context.window.EdenBirthBridgeStatus, "patched");
	assert.equal(f.api.patchSource(f.script.textContent), f.script.textContent);
});

test("native bridge patches the actual lexical macro before registration", actualRuntime, () => {
	const f = bridge(native);
	assert.equal(f.context.window.EdenBirthBridgeStatus, "native-records");
	assert.match(f.script.textContent, /recorded = edenCarrier \? carrier : rememberRandomCarrier/);
	assert.equal(f.api.patchSource(f.script.textContent), f.script.textContent);
	new vm.Script(f.script.textContent);
});

test("changed upstream anchors produce no partial patch", actualRuntime, () => {
	const altered = native.replace("recorded = rememberRandomCarrier(slot, location);", "recorded = rememberRandomCarrier(slot, location, true);");
	const f = bridge(altered);
	assert.equal(f.script.textContent, altered);
	assert.equal(f.context.window.EdenBirthBridgeStatus, "unsupported-records");
});

for (const species of ["human", "wolfgirl", "harpy"]) {
	test(`${species}: conception records the adult identity, native litter and true species`, actualRuntime, () => {
		const f = fixture({ species });
		const id = f.conceive();
		assert.equal(id, 1);
		assert.equal(f.record.adult.pregnancy.pregnancyId, id);
		assert.equal(f.record.adult.pregnancy.edenParentChildId, "0");
		const p = f.vars.pregnancies[id];
		assert.equal(p.carrier, "Eden child 0");
		assert.equal(p.carrierSpecies, species);
		assert.equal(p.donorSpecies, species === "wolfgirl" ? "wolfgirl" : species);
		assert.equal(Object.keys(f.vars.storedNPCs).length, 0);
		const litter = f.context.getChildrenOf(id);
		assert.ok(litter.length);
		for (const child of litter) {
			assert.equal(child.bornDate, null);
			assert.equal(child.edenGeneticParentId, "0");
			assert.equal(f.eden.children[child.childId], undefined);
			if (species !== "human") assert.equal(child.features.monster, "monster");
		}
		assert.equal(f.conceive(), null);
		assert.equal(f.vars.pregnancies.length, 2);
	});
}

test("native genetic generation can read the adult's actual colours", actualRuntime, () => {
	const f = fixture();
	const id = f.conceive();
	const child = f.context.getChildrenOf(id)[0];
	assert.equal(child.features.hairColour, "red");
	assert.equal(child.features.eyeColour, "green");
	assert.equal(child.features.skinColour, "dark");
	assert.equal(f.api.nativeParentTraits("Eden child missing"), null);
});

for (const [name, mutate] of [
	["NPC pregnancy disabled", f => { f.vars.settings.npcPregnancyEnabled = false; }],
	["no chance", f => { f.vars.settings.baseNpcPregnancyChance = 0; }],
	["scene disabled", f => { f.vars.disableImpregnation = true; }],
	["normal scene disabled", f => { f.vars.disableNormalImpregnation = true; }],
	["nightmare", f => { f.vars.activeNightmare = true; }],
	["infertile parent", f => { f.context.setup.pregnancy.infertile.push("Eden child 0"); }],
]) {
	test(`Eden tracking preserves native gates: ${name}`, actualRuntime, () => {
		const f = fixture(); mutate(f);
		assert.equal(f.conceive(), null);
		assert.equal(f.vars.pregnancies.length, 1);
		assert.equal(f.record.adult.pregnancy, null);
	});
}

test("ordinary NPCs still use native random tracking, and unverified Eden identities get no exemption", actualRuntime, () => {
	const f = fixture({ species: "harpy" });
	f.vars.NPCList[0].edenChildId = "missing";
	assert.equal(f.api.encounterSpecies(f.vars.NPCList[0]), null);
	assert.equal(f.macros.npcPregnancyRoll("Eden child 0", "harpy", "pc", "human", "vagina", "deep", "eden_home", 1, 0), null);
	f.vars.NPCList[0] = { fullDescription: "ordinary NPC", type: "human", pregnancy: 0 };
	f.context.random = (min, max) => max;
	assert.equal(f.macros.npcPregnancyRoll("ordinary NPC", "human", "pc", "human", "vagina", "deep", "street", 1, 0), null);
	assert.equal(Object.keys(f.vars.storedNPCs).length, 0);
	assert.equal(f.vars.pregnancies.length, 1);
});

test("Eden tracking remains guaranteed even beyond the native random-NPC tracking limit", actualRuntime, () => {
	const f = fixture();
	for (let i = 0; i < 20; i++) {
		f.vars.storedNPCs[`ordinary${i}`] = { npc: { fullDescription: "ordinary NPC" } };
		f.context.pushPregnancyRecord({ carrier: `ordinary${i}`, donor: "pc", donorSpecies: "human", conceivedDate: 0 });
	}
	assert.equal(f.conceive(), 21);
	assert.equal(Object.keys(f.vars.storedNPCs).length, 20);
	assert.equal(f.record.adult.pregnancy.pregnancyId, 21);
});

test("combat donors keep their stable identity and species, with player settings and contraception respected", actualRuntime, () => {
	const f = fixture({ species: "harpy" });
	f.vars.enemytype = "man";
	let load = f.macros.combatInseminate(0);
	assert.equal(load.donor, "Eden child 0");
	assert.equal(load.donorSpecies, "harpy");
	assert.equal(f.vars.cumLoads.vagina.length, 1);
	f.vars.settings.playerPregnancyEggLayingEnabled = false;
	assert.equal(f.macros.combatInseminate(0), null);
	f.vars.settings.playerPregnancyEggLayingEnabled = true;
	f.context.condomState = () => "worn";
	assert.equal(f.macros.combatInseminate(0), null);
	f.context.condomState = () => "none";
	f.context.playerChastity = () => true;
	assert.equal(f.macros.combatInseminate(0), null);
	assert.equal(f.vars.cumLoads.vagina.length, 1);
});

test("pregnancy 0 and child 0 are valid descriptors, using the native due date without a second clock", actualRuntime, () => {
	const f = fixture();
	const p = f.vars.pregnancies[0];
	Object.assign(p, { carrier: "Eden child 0", deliveredDate: null, donorSpecies: "human", conceivedDate: f.context.Time.date.timeStamp, gestationVariance: 1.2 });
	f.context.pushChildRecord({ pregnancyId: 0, species: "human", gender: "f", features: {} });
	// Child 0 is the adult, so it cannot also be in its own litter.
	f.vars.childRecords[0].pregnancyId = f.context.pushPregnancyRecord({ carrier: "pc", donor: "Robin", deliveredDate: 0, conceivedDate: 0 });
	assert.equal(f.api.captureNativePregnancy(f.eden, 0, 0), true);
	const dueDate = f.context.getDueDate(p);
	f.advanceTo(p.conceivedDate + (dueDate - p.conceivedDate) / 2);
	f.api.syncAll(f.eden);
	assert.equal(f.api.pregnancyStatus(f.record).pregnancyId, 0);
	assert.equal(f.api.pregnancyStatus(f.record).percent, 50);
	assert.equal(f.record.adult.pregnancy.timer, undefined);
	assert.equal(f.deliver().ok, false);
	assert.equal(f.api.retryDelivery(f.record), false);
	f.advanceTo(dueDate);
	assert.equal(f.api.nextDue(f.eden), "0");
	assert.equal(f.deliver().ok, true);
	assert.equal(f.vars.pregnancies[0], p);
});

test("delivery uses native records once, preserves IDs, and inherits Eden traits", actualRuntime, () => {
	const f = fixture();
	const id = f.conceive();
	const litter = f.context.getChildrenOf(id);
	const originalIds = litter.map(c => c.childId);
	const originalGenes = JSON.stringify(litter.map(c => c.features));
	f.due();
	const result = f.deliver();
	assert.equal(result.ok, true);
	assert.equal(result.destination, "eden_home");
	assert.equal(result.pregnancyId, id);
	assert.equal(f.vars.pregnancies.length, 2);
	assert.equal(f.vars.childRecords.length, 2);
	assert.deepEqual([...litter.map(c => c.childId)], [...originalIds]);
	assert.equal(JSON.stringify(litter.map(c => c.features)), originalGenes);
	assert.ok(Number.isFinite(litter[0].bornDate));
	assert.equal(litter[0].development.birthLocation, "eden_home");
	assert.equal(f.eden.children[litter[0].childId].geneticParentId, "0");
	assert.equal(f.eden.children[litter[0].childId].innate.inheritedFrom, "0");
	assert.equal(f.record.adult.birthEvents, 1);
	assert.equal(f.vars.pregnancyStats.npcTotalBirthEvents, 1);
	assert.equal(f.vars.pregnancyStats.npcChildren, 1);
	assert.equal(f.deliver(), result);
	assert.equal(f.record.adult.birthEvents, 1);
	assert.equal(f.vars.pregnancyStats.npcChildren, 1);
	assert.equal(f.api.nextDue(f.eden), null);
});

test("identical twins stay together; one remaining place sends the entire litter home", actualRuntime, () => {
	const f = fixture({ capacity: 1 });
	f.context.weightedRandom = () => 2;
	const id = f.conceive();
	const litter = f.context.getChildrenOf(id);
	assert.equal(litter.length, 2);
	assert.equal(litter[0].identical, id);
	assert.equal(litter[1].identical, id);
	f.due();
	const result = f.deliver();
	assert.equal(result.ok, true);
	assert.equal(result.destination, "home");
	for (const child of litter) {
		assert.equal(child.development.location, "home");
		assert.equal(child.development.birthLocation, "hospital");
		assert.equal(f.eden.children[child.childId].geneticParentId, "0");
	}
	assert.equal(f.vars.pregnancyStats.npcChildren, 2);
	assert.equal(f.vars.pregnancyStats.npcTotalBirthEvents, 1);
});

test("laid eggs occupy places, while an unborn litter does not", actualRuntime, () => {
	const f = fixture({ capacity: 2 });
	const eggPregnancy = f.context.pushPregnancyRecord({ carrier: "pc", donor: "Great Hawk", donorSpecies: "hawk", conceivedDate: 0, deliveredDate: 0, hatchDelay: 0 });
	f.context.pushChildRecord({ pregnancyId: eggPregnancy, species: "hawk", gender: "f", features: {}, development: { location: "eden_home" } });
	f.context.weightedRandom = () => 2;
	f.conceive(); f.due();
	assert.equal(f.deliver().destination, "home");
	const g = fixture({ capacity: 2 });
	g.context.weightedRandom = () => 2;
	g.conceive(); g.due();
	assert.equal(g.deliver().destination, "eden_home");
});

test("a missing helper fails safely and can be retried after restoring the helper", actualRuntime, () => {
	const f = fixture(); f.conceive(); f.due();
	const original = f.context.birthRecordedLitter;
	f.context.birthRecordedLitter = undefined;
	const before = structuredClone(f.vars.pregnancyStats);
	assert.equal(f.deliver().ok, false);
	assert.equal(f.record.adult.pregnancy.deliveryBlocked, true);
	assert.equal(f.api.nextDue(f.eden), null);
	assert.deepEqual(f.vars.pregnancyStats, before);
	f.context.birthRecordedLitter = original;
	assert.equal(f.api.retryDelivery(f.record), true);
	assert.equal(f.deliver().ok, true);
	assert.equal(f.vars.pregnancyStats.npcTotalBirthEvents, 1);
});

test("partial native delivery rolls back children, development, counters and names in place", actualRuntime, () => {
	const f = fixture(); f.context.weightedRandom = () => 2; const id = f.conceive(); f.due();
	const litter = f.context.getChildrenOf(id);
	const p = f.vars.pregnancies[id];
	const descriptor = f.record.adult.pregnancy;
	const before = structuredClone(f.vars);
	const original = f.context.birthRecordedLitter;
	f.context.birthRecordedLitter = (...args) => { original(...args); throw new Error("interrupted after delivery"); };
	assert.equal(f.deliver().ok, false);
	assert.equal(f.vars.pregnancies[id], p);
	assert.equal(f.record.adult.pregnancy, descriptor);
	assert.equal(f.vars.childRecords[litter[0].childId], litter[0]);
	assert.equal(descriptor.deliveryBlocked, true);
	assert.match(descriptor.lastDeliveryError, /interrupted/);
	assert.deepEqual(structuredClone(f.vars.childRecords), before.childRecords);
	assert.deepEqual(structuredClone(f.vars.pregnancies), before.pregnancies);
	assert.deepEqual(f.vars.pregnancyStats, before.pregnancyStats);
	assert.equal(Object.keys(f.eden.children).length, 1);
	f.context.birthRecordedLitter = original;
	f.api.retryDelivery(f.record);
	assert.equal(f.deliver().ok, true);
	assert.equal(f.vars.pregnancyStats.npcChildren, 2);
});

test("a helper returning without completing delivery is also rolled back", actualRuntime, () => {
	const f = fixture(); const id = f.conceive(); f.due();
	f.context.birthRecordedLitter = () => { f.vars.pregnancies[id].deliveredDate = f.context.Time.date.timeStamp; };
	assert.equal(f.deliver().ok, false);
	assert.equal(f.vars.pregnancies[id].deliveredDate, null);
	assert.equal(f.vars.childRecords[1].bornDate, null);
	assert.equal(f.record.adult.pregnancy.deliveryBlocked, true);
});

for (const destination of ["eden_home", "home"]) {
	test(`birds: lay first, then hatch at native time in ${destination}, without counting a second birth`, actualRuntime, () => {
		const f = fixture({ species: "harpy", capacity: destination === "home" ? 0 : 6 });
		const id = f.conceive(); f.due();
		const result = f.deliver();
		const egg = f.context.getChildrenOf(id)[0];
		assert.equal(result.ok, true);
		assert.equal(result.isEgg, true);
		assert.equal(result.destination, destination);
		assert.equal(egg.bornDate, null);
		assert.equal(f.context.EdenChildData.phaseOf(egg), "egg");
		assert.equal(f.context.EdenChildData.ageDays(egg), 0);
		const p = f.vars.pregnancies[id];
		const layDate = p.deliveredDate;
		const hatchDate = f.context.getHatchDate(p);
		f.advanceTo(hatchDate - 1);
		assert.equal(f.api.syncHatching(f.eden), 0);
		f.advanceTo(hatchDate);
		assert.equal(f.api.syncHatching(f.eden), 1);
		assert.equal(egg.bornDate, hatchDate);
		assert.equal(p.deliveredDate, layDate);
		assert.equal(egg.development.location, destination);
		assert.ok(egg.name);
		assert.equal(f.api.syncHatching(f.eden), 0);
		assert.equal(f.vars.pregnancyStats.hawkChildren, 1);
		assert.equal(f.vars.pregnancyStats.npcTotalBirthEvents, 1);
	});
}

test("hatching preserves adopted or moved eggs, and leaves tower/unrelated eggs to native flow", actualRuntime, () => {
	const f = fixture({ species: "harpy" });
	const id = f.conceive(); f.due(); f.deliver();
	const egg = f.context.getChildrenOf(id)[0];
	egg.name = "已命名";
	egg.development.adoptedDate = 0;
	egg.development.interactionsTotal = 16;
	egg.development.location = "home";
	const towerId = f.context.pushChildRecord({ pregnancyId: id, species: "hawk", gender: "m", features: {}, development: { location: "tower" } });
	const unrelatedId = f.context.pushChildRecord({ pregnancyId: id, species: "hawk", gender: "m", features: {}, development: { location: "home" } });
	f.advanceTo(f.context.getHatchDate(f.vars.pregnancies[id]));
	assert.equal(f.api.syncHatching(f.eden), 1);
	assert.equal(egg.name, "已命名");
	assert.equal(egg.development.adoptedDate, 0);
	assert.equal(egg.development.interactionsTotal, 16);
	assert.equal(f.vars.childRecords[towerId].bornDate, null);
	assert.equal(f.vars.childRecords[unrelatedId].bornDate, null);
});

test("stat freeze prevents both delivery and egg hatching", actualRuntime, () => {
	const f = fixture({ species: "harpy" }); const id = f.conceive(); f.due();
	f.vars.statFreeze = true;
	assert.equal(f.api.nextDue(f.eden), null);
	assert.equal(f.deliver().ok, false);
	assert.equal(f.vars.pregnancies[id].deliveredDate, null);
	f.vars.statFreeze = false; f.deliver();
	f.advanceTo(f.context.getHatchDate(f.vars.pregnancies[id]));
	f.vars.statFreeze = true;
	assert.equal(f.api.syncHatching(f.eden), 0);
	assert.equal(f.vars.childRecords[1].bornDate, null);
	f.vars.statFreeze = false;
	assert.equal(f.api.syncHatching(f.eden), 1);
});

test("player pregnancies link the actual Eden donor, without revealing uncertain paternity", actualRuntime, () => {
	const f = fixture();
	const id = f.context.createPregnancy("pc", "human", "Eden child 0", "human", [{ name: "Eden child 0", species: "human" }, { name: "Robin", species: "human" }], f.context.Time.date.timeStamp, "vagina", "home");
	f.api.syncAll(f.eden);
	const child = f.context.getChildrenOf(id)[0];
	assert.equal(child.edenGeneticParentId, "0");
	assert.equal(f.eden.children[child.childId], undefined);
	assert.equal(f.vars.pregnancies[id].awareOfDonor.includes("pc"), false);
	f.context.birthRecordedLitter(id, "hospital", "home");
	f.context.EdenChildData.syncRegistry(f.eden);
	f.api.syncAll(f.eden);
	f.context.EdenTraits.syncAll(f.eden, f.context.EdenChildData.collection());
	assert.equal(f.eden.children[child.childId].geneticParentId, "0");
	assert.equal(f.eden.children[child.childId].innate.inheritedFrom, "0");
	assert.equal(f.context.EdenChildData.parentsOf(child).fatherKnown, false);
});

test("stored native NPC pregnancy is detached from automatic native delivery and kept by Eden", actualRuntime, () => {
	const f = fixture(); const id = f.conceive();
	f.vars.pregnancies[id].carrier = "pregnancy_0";
	f.vars.storedNPCs.pregnancy_0 = { npc: { fullDescription: "Eden child 0" } };
	f.record.adult.pregnancy = null;
	assert.equal(f.api.captureEncounterPregnancy(f.eden, f.context.EdenChildData.collection({ scope: "all" }), f.record, 0), true);
	assert.equal(f.vars.pregnancies[id].carrier, "Eden child 0");
	assert.equal(f.vars.storedNPCs.pregnancy_0, undefined);
	f.due();
	f.context.randomPregnancyProgress();
	assert.equal(f.vars.pregnancies[id].deliveredDate, null);
	assert.equal(f.deliver().ok, true);
});

test("a new pregnancy cannot use the previous birth result or be forced early by retry", actualRuntime, () => {
	const f = fixture(); f.conceive(); f.due(); assert.equal(f.deliver().ok, true);
	f.vars.NPCList[0].pregnancy = 0;
	const id = f.conceive();
	assert.equal(id, 2);
	assert.equal(f.api.retryDelivery(f.record), false);
	assert.equal(f.deliver().ok, false);
	assert.equal(f.record.adult.birthEvents, 1);
	f.due(); assert.equal(f.deliver().pregnancyId, 2);
	assert.equal(f.record.adult.birthEvents, 2);
});

test("cleared or foreign pregnancy descriptors cannot produce children", actualRuntime, () => {
	const f = fixture(); const id = f.conceive(); f.due();
	f.vars.pregnancies[id].carrier = "someone else";
	assert.equal(f.deliver().ok, false);
	assert.equal(f.api.retryDelivery(f.record), false);
	assert.equal(f.api.nextDue(f.eden), null);
	f.vars.pregnancies[id].carrier = "cleared";
	f.api.syncAll(f.eden);
	assert.equal(f.record.adult.pregnancy, null);
	assert.equal(f.deliver().ok, false);
	assert.equal(f.vars.pregnancyStats.npcChildren, 0);
});

test("wolf offspring use the native wolf birth location when housed at the orphanage", actualRuntime, () => {
	const f = fixture({ species: "wolfgirl", capacity: 0 });
	const id = f.conceive(); f.due();
	assert.equal(f.deliver().destination, "home");
	for (const child of f.context.getChildrenOf(id)) {
		assert.equal(child.development.birthLocation, "wolf_cave");
		assert.equal(child.development.location, "home");
		assert.equal(f.eden.children[child.childId].innate.inheritedFrom, "0");
	}
});

test("a descriptor belonging to another adult cannot settle their pregnancy under this adult", actualRuntime, () => {
	const f = fixture(); const id = f.conceive(); f.due();
	const descriptor = f.record.adult.pregnancy;
	descriptor.edenParentChildId = "1";
	f.vars.pregnancies[id].carrier = "Eden child 1";
	assert.equal(f.api.pregnancyStatus(f.record), null);
	assert.equal(f.deliver().ok, false);
	assert.equal(f.api.retryDelivery(f.record), false);
	assert.equal(f.vars.pregnancyStats.npcChildren, 0);
});

test("hatching failure rolls back the entire ready clutch and allows the next sync to retry", actualRuntime, () => {
	const f = fixture({ species: "harpy" }); f.context.weightedRandom = () => 2;
	const id = f.conceive(); f.due(); f.deliver();
	const litter = f.context.getChildrenOf(id);
	f.advanceTo(f.context.getHatchDate(f.vars.pregnancies[id]));
	const original = f.context.recordBirth;
	let count = 0;
	f.context.recordBirth = childId => { original(childId); if (++count === 2) throw new Error("hatching interrupted"); };
	assert.equal(f.api.syncHatching(f.eden), 0);
	for (const child of litter) { assert.equal(child.bornDate, null); assert.equal(child.name, null); }
	f.context.recordBirth = original;
	assert.equal(f.api.syncHatching(f.eden), 2);
	assert.equal(f.vars.pregnancyStats.hawkChildren, 2);
});

test("post-delivery mod errors restore both native delivery and the adult's mod state", actualRuntime, () => {
	const f = fixture(); const id = f.conceive(); f.due();
	const original = f.context.EdenTraits;
	f.context.EdenTraits = { syncAll() { throw new Error("traits interrupted"); } };
	assert.equal(f.deliver().ok, false);
	assert.equal(f.vars.pregnancies[id].deliveredDate, null);
	assert.equal(f.record.adult.birthEvents, 0);
	assert.equal(f.record.adult.lastDeliveredPregnancyId, undefined);
	assert.equal(f.eden.children[1], undefined);
	assert.equal(f.vars.pregnancyStats.npcTotalBirthEvents, 0);
	f.context.EdenTraits = original;
	f.api.retryDelivery(f.record);
	assert.equal(f.deliver().ok, true);
});

test("pregnancy hooks and old-save migration can patch the same actual native script", actualRuntime, () => {
	const f = bridge(native);
	vm.runInContext(read("eden-save-migration"), f.context);
	const combined = f.context.window.EdenSaveMigration.patchSource(f.script.textContent);
	assert.match(combined, /Eden pregnancy records hooks/);
	assert.match(combined, /captureChildMap\(oldKeyToNewId\)/);
	new vm.Script(combined);
	assert.equal(f.api.patchSource(combined), combined);
});

test("legacy pregnancy capture, daily progress, delivery and repeat visits remain supported", () => {
	const vars = { eden: { children: { parent: { childId: "parent", adult: { settled: true, birthEvents: 0 } } }, facility: { owned: true, capacity: 3 } },
		children: { parent: { childId: "parent", type: "human", location: "eden_contacts", name: "旧名字" } },
		storedNPCs: { legacy: { npc: { fullDescription: "Eden child parent" }, pregnancy: { type: "human", fetus: [{ childId: "baby", type: "human", mother: "Eden child parent", father: "pc" }], timer: 8, timerEnd: 10 } } },
		settings: { humanPregnancyMonths: 9 }, pregnancyStats: { npcTotalBirthEvents: 0 } };
	const window = { SugarCube: { State: { variables: vars } }, Time: { year: 2026, month: 1, monthDay: 1 } };
	const context = vm.createContext({ window });
	vm.runInContext(read("eden-child-data"), context);
	vm.runInContext(read("eden-breeding"), context);
	const api = window.EdenBreeding;
	api.syncAll(vars.eden, vars.children);
	assert.equal(vars.storedNPCs.legacy, undefined);
	assert.equal(vars.eden.children.parent.adult.pregnancy.edenDataVersion, 1);
	window.Time.monthDay = 3;
	api.syncAll(vars.eden, vars.children);
	assert.equal(api.nextDue(vars.eden), "parent");
	let calls = 0;
	window.giveBirthToChildren = (carrier, birthLocation, location, p) => { calls++; vars.children.baby = { ...p.fetus[0], location }; return true; };
	const result = api.deliver(vars.eden, vars.children, "parent");
	assert.equal(result.ok, true);
	assert.equal(vars.eden.children.baby.geneticParentId, "parent");
	assert.equal(vars.eden.children.parent.adult.birthEvents, 1);
	assert.equal(api.deliver(vars.eden, vars.children, "parent"), result);
	assert.equal(calls, 1);
});
