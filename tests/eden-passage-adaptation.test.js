const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const modules = path.join(__dirname, "../mods/FertilityExpansion/modules");
const read = name => fs.readFileSync(path.join(modules, name + ".js"), "utf8");
const runtimePath = process.env.DOL_0512_HTML || path.resolve(__dirname, "../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html");
const native = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8").match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1] : null;
const actualRuntime = { skip: native ? false : "Set DOL_0512_HTML for native contact conception tests" };
function nativeFile(name) {
	const headers = [...native.matchAll(/\/\* twine-user-script #\d+: "([^"]+)" \*\//g)];
	const i = headers.findIndex(h => h[1].endsWith("\\" + name)); assert.ok(i >= 0, name);
	return native.slice(headers[i].index + headers[i][0].length, headers[i + 1]?.index ?? native.length);
}
function fixture({ records = true, enabled = true, actual = false } = {}) {
	const vars = { options: { eden: { allowSterilePregnancy: enabled } }, eden: { settings: { allowSterilePregnancy: enabled }, children: {} },
		NPCNameList: ["Bailey", "Leighton", "Gwylan", "Alex"], storedNPCs: {}, NPCList: [], location: "home",
		settings: { pregnancyType: records ? "fetish" : "silly", nnpcPregnancyEnabled: true, npcPregnancyEnabled: true, fertilityCycleEnabled: false,
			basePlayerPregnancyChance: 100, baseNpcPregnancyChance: 100, darkSkinChance: 0, humanPregnancyMonths: 3, wolfPregnancyWeeks: 4, birdPregnancyWeeks: 4 },
		player: { vaginaExist: true, penisExist: true, sex: "h" }, naturalhaircolour: "brown", eyeselect: "blue", bodysize: 2,
		worn: { hands: { name: "naked" }, face: { type: [] } }, earSlime: { event: "none", growth: 0 }, skin: { pubic: {} },
		sexStats: { vagina: { pregnancy: { fetus: [] }, menstruation: { currentState: "normal", currentDay: 14 } }, anus: { pregnancy: { fetus: [] } }, pills: { pills: { contraceptive: { doseTaken: 0 }, "fertility booster": { doseTaken: 0 } } } },
		pendingPregnancies: { vagina: null, anus: null }, cumLoads: { vagina: [], anus: [] },
	};
	if (records) { vars.pregnancies = []; vars.childRecords = []; }
	const setup = { pregnancy: { canBePregnant: ["Alex"], canImpregnatePlayer: ["Alex"], infertile: ["Bailey", "Leighton"],
		typesEnabled: ["human", "wolf", "wolfboy", "wolfgirl", "hawk", "harpy"], randomAlwaysKeep: [] } };
	const npc = Object.fromEntries(vars.NPCNameList.map(name => [name, { type: "human", vagina: "exist", penis: "exist", skincolour: "white", pregnancy: { enabled: true, cycleDay: 14, cycleDaysTotal: 28, cycleDangerousDay: 10, pills: null } }]));
	let updates = 0;
	const context = vm.createContext({ V: vars, C: { npc }, setup, document: {}, $: () => ({ on() {} }),
		Wikifier: function() {
			updates++;
			// Unrelated UI renderer stand-in; reproduce the native updater's reset guard.
			for (const name of vars.NPCNameList) if (setup.pregnancy.infertile.includes(name) || (!setup.pregnancy.canBePregnant.includes(name) && !vars.settings.incompletePregnancyEnabled)) npc[name].pregnancy = {};
		},
		Time: { days: 365, year: 2, month: 1, monthDay: 1, hour: 8, date: { timeStamp: 365 * 86400 } },
		clone: structuredClone, structuredClone, ConstantsLoader: { init: value => value }, State: { random: () => 0.5 }, T: {}, DefineMacro() {},
		random: (min = 0) => min, weightedRandom: (...choices) => choices[0][0], Skin: { color: { natural: "light" } },
	});
	context.window = context; context.SugarCube = { State: { variables: vars } };
	vm.runInContext('Math.clamp = (v,l,h) => Math.max(l,Math.min(h,v)); Array.prototype.random = function(){return this[0]}; Array.prototype.pushUnique = function(...v){ for(const x of v) if(!this.includes(x)) this.push(x) };', context);
	if (actual) for (const name of ["00-time-constants.js", "pregnancy-constants.js", "pregnancy-records.js", "child-generator.js", "eligibility.js", "conception.js", "pregnancy-lifecycle.js", "pregnancy-macros.js", "parasite.js"]) vm.runInContext(nativeFile(name), context);
	for (const name of ["eden-child-data", "eden-pregnancy-settings"]) vm.runInContext(read(name), context);
	return { context, vars, npc, setup, api: context.EdenPregnancySettings, get updates() { return updates; } };
}

test("records retain active NPC pregnancy despite disabled or cleared legacy NPC config", () => {
	const f = fixture();
	f.vars.pregnancies = [{ pregnancyId: 0, carrier: "Bailey", deliveredDate: null }];
	f.npc.Bailey.pregnancy.enabled = false;
	assert.equal(f.api.hasActivePregnancy("Bailey"), true);
	f.vars.pregnancies[0].deliveredDate = 0;
	assert.equal(f.api.hasActivePregnancy("Bailey"), false);
	f.vars.pregnancies[0] = { pregnancyId: 0, carrier: "cleared", deliveredDate: null };
	assert.equal(f.api.hasActivePregnancy("Bailey"), false);
});

for (const records of [false, true]) {
	test(`${records ? "records" : "legacy"}: disabling the option protects the current pregnancy, then restores restrictions after birth`, () => {
		const f = fixture({ records }); f.api.apply();
		const config = f.npc.Bailey.pregnancy;
		if (records) f.vars.pregnancies.push({ pregnancyId: 0, carrier: "Bailey", deliveredDate: null });
		else Object.assign(config, { type: "human", fetus: [{}] });
		f.vars.options.eden.allowSterilePregnancy = false; // eden.settings deliberately remains stale true.
		assert.equal(f.api.apply(), false);
		assert.equal(f.setup.pregnancy.canBePregnant.includes("Bailey"), true);
		assert.equal(f.setup.pregnancy.canImpregnatePlayer.includes("Bailey"), false);
		assert.equal(f.setup.pregnancy.infertile.includes("Bailey"), false);
		assert.equal(f.npc.Bailey.pregnancy, config);
		assert.equal(config.cycleDay, 14);
		if (records) f.vars.pregnancies[0].deliveredDate = 0;
		else Object.assign(config, { type: null, fetus: [] });
		f.api.apply();
		assert.equal(f.setup.pregnancy.canBePregnant.includes("Bailey"), false);
		assert.equal(f.setup.pregnancy.infertile.includes("Bailey"), true);
	});
}

test("loaded active pregnancies are protected with the option already off", () => {
	const f = fixture({ enabled: false });
	f.vars.pregnancies.push({ pregnancyId: 0, carrier: "Leighton", deliveredDate: null });
	f.api.apply();
	assert.equal(f.setup.pregnancy.canBePregnant.includes("Leighton"), true);
	assert.equal(f.setup.pregnancy.infertile.includes("Leighton"), false);
	assert.equal(f.setup.pregnancy.canImpregnatePlayer.includes("Leighton"), false);
});

test("list changes are idempotent and retain support already supplied by another mod", () => {
	const f = fixture(); f.setup.pregnancy.canBePregnant.push("Gwylan"); f.setup.pregnancy.canImpregnatePlayer.push("Gwylan");
	f.api.apply(); const updates = f.updates;
	f.api.apply(); f.api.apply(); assert.equal(f.updates, updates);
	assert.equal(f.setup.pregnancy.canBePregnant.filter(n => n === "Gwylan").length, 1);
	f.vars.options.eden.allowSterilePregnancy = false; f.api.apply();
	assert.equal(f.setup.pregnancy.canBePregnant.includes("Gwylan"), true);
	assert.equal(f.setup.pregnancy.canImpregnatePlayer.includes("Gwylan"), true);
	assert.equal(f.setup.pregnancy.canBePregnant.includes("Alex"), true);
});

test("deferred native updater runs when it becomes available; replacing setup starts a new baseline", () => {
	const f = fixture(); const updater = f.context.Wikifier; f.context.Wikifier = undefined;
	f.api.apply(); assert.equal(f.updates, 0);
	f.context.Wikifier = updater; f.api.apply(); assert.equal(f.updates, 1);
	f.setup.pregnancy = { canBePregnant: ["Gwylan"], canImpregnatePlayer: ["Gwylan"], infertile: ["Bailey", "Leighton"] };
	f.api.apply(); f.vars.options.eden.allowSterilePregnancy = false; f.api.apply();
	assert.equal(f.setup.pregnancy.canBePregnant.includes("Gwylan"), true);
});

for (const genital of ["hand", "kiss"]) {
	test(`native fairy ${genital} contact creates pregnancy 0 in both eligible directions, without persistent loads or duplicate pregnancies`, actualRuntime, () => {
		const f = fixture({ actual: true });
		assert.equal(f.api.recordGwylanFairyContact("Gwylan", "human", genital), true);
		assert.equal(f.vars.pregnancies.length, 2);
		assert.equal(f.vars.pregnancies[0].carrier, "pc");
		assert.equal(f.vars.pregnancies[0].donor, "Gwylan");
		assert.equal(f.vars.pregnancies[1].carrier, "Gwylan");
		assert.equal(f.vars.pregnancies[1].donor, "pc");
		assert.equal(f.vars.childRecords.length, 2);
		assert.equal(f.vars.cumLoads.vagina.length, 0);
		f.api.recordGwylanFairyContact(f.npc.Gwylan = { ...f.npc.Gwylan, fullDescription: "Gwylan" }, "human", genital);
		assert.equal(f.vars.pregnancies.length, 2);
	});
}

for (const [name, mutate] of [
	["option off", f => { f.vars.options.eden.allowSterilePregnancy = false; }],
	["realistic mode", f => { f.vars.settings.pregnancyType = "realistic"; }],
	["nightmare", f => { f.vars.activeNightmare = true; }],
	["scene disabled", f => { f.vars.disableImpregnation = true; }],
	["normal scene disabled", f => { f.vars.disableNormalImpregnation = true; }],
	["stat freeze", f => { f.vars.statFreeze = true; }],
	["gloves", f => { f.vars.worn.hands.name = "gloves"; }],
]) test(`native special contact blocked by ${name}`, actualRuntime, () => {
	const f = fixture({ actual: true }); mutate(f);
	f.api.recordGwylanFairyContact("Gwylan", "human", "hand"); assert.equal(f.vars.pregnancies.length, 0);
});

test("face coverings prevent fairy kiss; other names and other contacts have no special effect", actualRuntime, () => {
	const f = fixture({ actual: true }); f.vars.worn.face.type = ["face_covering"];
	f.api.recordGwylanFairyContact("Gwylan", "human", "kiss");
	assert.equal(f.api.recordGwylanFairyContact("Bailey", "human", "hand"), false);
	assert.equal(f.api.recordGwylanFairyContact("Gwylan", "human", "hug"), false);
	assert.equal(f.vars.pregnancies.length, 0);
});

test("player and named-NPC switches are independent; generated NPC switch does not disable named pregnancy", actualRuntime, () => {
	const f = fixture({ actual: true }); f.vars.settings.nnpcPregnancyEnabled = false;
	f.api.recordGwylanFairyContact("Gwylan", "human", "hand");
	assert.equal(f.vars.pregnancies.length, 1); assert.equal(f.vars.pregnancies[0].carrier, "pc");
	const g = fixture({ actual: true }); g.vars.settings.playerPregnancyHumanEnabled = false; g.vars.settings.npcPregnancyEnabled = false;
	g.api.recordGwylanFairyContact("Gwylan", "human", "hand");
	assert.equal(g.vars.pregnancies.length, 1); assert.equal(g.vars.pregnancies[0].carrier, "Gwylan");
});

test("native chance, PC medication and named-NPC medication remain effective", actualRuntime, () => {
	const f = fixture({ actual: true }); f.vars.settings.basePlayerPregnancyChance = 0; f.vars.settings.baseNpcPregnancyChance = 0;
	f.api.recordGwylanFairyContact("Gwylan", "human", "hand"); assert.equal(f.vars.pregnancies.length, 0);
	const g = fixture({ actual: true }); g.vars.sexStats.pills.pills.contraceptive.doseTaken = 2; g.npc.Gwylan.pregnancy.pills = "contraceptive";
	g.api.recordGwylanFairyContact("Gwylan", "human", "hand"); assert.equal(g.vars.pregnancies.length, 0);
});

test("anatomy selects anal pregnancy only with the corresponding native options", actualRuntime, () => {
	const f = fixture({ actual: true }); f.vars.player.vaginaExist = false; f.npc.Gwylan.vagina = "none";
	f.api.recordGwylanFairyContact("Gwylan", "human", "hand"); assert.equal(f.vars.pregnancies.length, 0);
	f.vars.settings.analPregnancy = "always"; f.vars.settings.npcAnalPregnancyEnabled = true;
	f.api.recordGwylanFairyContact("Gwylan", "human", "hand");
	assert.equal(f.vars.pregnancies.length, 2);
	assert.equal(f.vars.pregnancies[0].orifice, "anus"); assert.equal(f.vars.pregnancies[1].orifice, "anus");
	const g = fixture({ actual: true }); g.vars.player.penisExist = false; g.npc.Gwylan.penis = "none";
	g.api.recordGwylanFairyContact("Gwylan", "human", "hand"); assert.equal(g.vars.pregnancies.length, 0);
});

test("legacy silly mode still calls the original helper and realistic mode does not", () => {
	const f = fixture({ records: false }); const calls = [];
	f.context.fetishPregnancy = payload => calls.push(payload);
	f.api.recordGwylanFairyContact("Gwylan", "human", "hand"); assert.equal(calls.length, 2);
	f.vars.settings.pregnancyType = "realistic";
	assert.equal(f.api.recordGwylanFairyContact("Gwylan", "human", "kiss"), false); assert.equal(calls.length, 2);
});

function interactionFixture(records) {
	const f = fixture({ records, enabled: false });
	for (const name of ["eden-age", "eden-adult", "eden-interactions", "eden-bed-visit"]) vm.runInContext(read(name), f.context);
	const id = records ? "0" : "old|id";
	const child = records ? { childId: 0, pregnancyId: 0, species: "hawk", gender: "f", features: { monster: "monster" }, bornDate: 0, development: { location: "eden_home", interactionsTotal: 7 } }
		: { childId: id, type: "harpy", gender: "f", location: "eden_home", localVariables: { interactionsTotal: 7 } };
	const record = { childId: id, species: "bird", lifeStage: "child", bodyForm: "humanoid", affection: 70, training: { skills: { awareness: 30 } }, adult: { settled: false } };
	f.vars.eden.settings.maturityDays = 90;
	f.vars.eden.children[id] = record;
	if (records) { f.vars.childRecords = [child]; f.vars.pregnancies = [{ pregnancyId: 0, carrier: "pc", donor: "Great Hawk", deliveredDate: 0 }]; }
	else f.vars.children = { [id]: child };
	return { ...f, id, record, child, interactions: f.context.EdenInteractions, bed: f.context.EdenBedVisit, data: f.context.EdenChildData,
		children: () => f.context.EdenChildData.collection() };
}
for (const records of [false, true]) {
	test(`${records ? "records zero" : "legacy"}: stage interactions read the correct location and award affection once`, () => {
		const f = interactionFixture(records);
		const id = records ? 0 : f.id;
		assert.equal(f.interactions.usesStagePool(f.vars.eden, f.children(), id), true);
		const activity = f.interactions.prepareStageActivity(f.vars.eden, f.children(), id);
		assert.ok(activity); assert.equal(activity.stage, "child");
		const event = f.interactions.createStageEvent(f.vars.eden, id, activity.id, 20);
		assert.equal(event.childId, f.id);
		const before = f.record.affection;
		assert.equal(f.interactions.completeStageInteraction(f.vars.eden, f.children(), event).ok, true);
		assert.ok(f.record.affection > before);
		assert.equal(f.record.bonding.totalInteractions, 1);
		assert.equal(f.interactions.completeStageInteraction(f.vars.eden, f.children(), event).ok, false);
		assert.equal(f.record.bonding.totalInteractions, 1);
		assert.equal(f.data.developmentOf(f.child).interactionsTotal, 7);
	});
	test(`${records ? "records zero" : "legacy"}: sleep/current contact accepts zero and rejects missing records`, () => {
		const f = interactionFixture(records);
		f.record.lifeStage = "adult"; f.record.affection = 85;
		Object.assign(f.record.adult, { settled: true, destination: "town", contactStatus: "active" });
		const selected = f.bed.trySleepInterrupt(f.vars.eden, f.children(), 1, () => 0);
		assert.equal(selected.childId, f.id);
		f.vars.eden.bedVisit.activeChildId = records ? 0 : f.id;
		assert.equal(f.bed.current(f.vars.eden, f.children()).child, f.child);
		delete f.vars.eden.children[f.id];
		assert.equal(f.bed.current(f.vars.eden, f.children()), null);
	});
}

test("eggs and unborn records cannot enter stage pools, affection interactions or sleep events", () => {
	const f = interactionFixture(true); f.child.bornDate = null;
	assert.equal(f.interactions.usesStagePool(f.vars.eden, f.children(), 0), false);
	assert.equal(f.interactions.recordInteraction(f.vars.eden, f.children(), 0, "stroke").ok, false);
	f.vars.pregnancies[0].deliveredDate = null;
	assert.equal(f.interactions.prepareStageActivity(f.vars.eden, f.children(), 0), null);
	assert.equal(f.interactions.recordInteraction(f.vars.eden, f.data.collection({ scope: "all" }), 0, "stroke").ok, false);
	Object.assign(f.record, { lifeStage: "adult", affection: 85 }); Object.assign(f.record.adult, { settled: true, destination: "town", contactStatus: "active" });
	assert.equal(f.bed.isEligible(f.record, f.child), false);
});

test("moved children or changed life stages cannot settle stale stage events", () => {
	const f = interactionFixture(true);
	const activity = f.interactions.prepareStageActivity(f.vars.eden, f.children(), 0);
	const event = f.interactions.createStageEvent(f.vars.eden, 0, activity.id, 20);
	f.child.development.location = "home";
	assert.equal(f.interactions.completeStageInteraction(f.vars.eden, f.children(), event).ok, false);
	assert.equal(event.completed, false); assert.equal(f.record.affection, 70);
	f.child.development.location = "eden_home"; f.record.lifeStage = "adolescent";
	assert.equal(f.interactions.createStageEvent(f.vars.eden, 0, activity.id, 20), null);
	assert.equal(f.interactions.completeStageInteraction(f.vars.eden, f.children(), event).ok, false);
});
