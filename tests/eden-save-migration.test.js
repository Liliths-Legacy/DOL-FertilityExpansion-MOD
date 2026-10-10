const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const modRoot = process.env.EDEN_MOD_DIR || path.join(__dirname, "../mods/FertilityExpansion");
const modSource = fs.readFileSync(path.join(modRoot, "modules/eden-save-migration.js"), "utf8");
const recoverySource = fs.readFileSync(path.join(modRoot, "modules/eden-save-recovery.js"), "utf8");
const runtimePath = process.env.DOL_0512_HTML || path.resolve(__dirname, "../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html");

function nativeSources() {
	if (!fs.existsSync(runtimePath)) return null;
	const html = fs.readFileSync(runtimePath, "utf8");
	const source = html.match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1];
	const headers = [...source.matchAll(/\/\* twine-user-script #\d+: "([^"]+)" \*\//g)];
	return ["pregnancy-records.js", "pregnancy-migration.js"].map(name => {
		const index = headers.findIndex(header => header[1].endsWith("\\" + name));
		assert.ok(index >= 0, `native file ${name} missing`);
		return source.slice(headers[index].index + headers[index][0].length, headers[index + 1]?.index ?? source.length);
	}).join("\n");
}

const native = nativeSources();
const actualRuntime = { skip: native ? false : "Set DOL_0512_HTML to run against the actual 0.5.12 HTML." };

function fixture(vars = {}) {
	const script = { textContent: "function giveBirthToChildren() {}" };
	const context = vm.createContext({
		V: vars, window: {}, document: { getElementById: () => script },
		structuredClone, clone: structuredClone,
		Time: { year: 2026, month: 4, monthDay: 1, days: 100, hour: 8, date: { timeStamp: 1000000000 }, monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
		TimeConstants: { secondsPerDay: 86400 }, PregnancyConstants: { birdHatchDelay: 500, birdNestTime: 86400 },
		DateTime: class { constructor(year, month, day) { this.timeStamp = Math.floor(Date.UTC(year, month - 1, day) / 1000); } },
		C: { npc: {} }, random: () => 0, console,
	});
	vm.runInContext("Math.clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));", context);
	vm.runInContext(recoverySource, context);
	vm.runInContext(modSource, context);
	return { context, vars, script, api: context.window.EdenSaveMigration };
}

function legacyChild(id, fields = {}) {
	return {
		childId: id, mother: "pc", father: "Robin", type: "human", birthId: 0,
		gender: "f", name: "同名", born: { day: 1, month: "January", year: 2026 },
		conceived: { day: 1, month: "October", year: 2025 }, location: "eden_home",
		motherKnown: true, fatherKnown: true, features: { beastTransform: "fox", identical: "twins" },
		localVariables: { activity: "sleeping", interactionsTotal: 15 }, ...fields,
	};
}

function record(id, fields = {}) {
	return {
		childId: id, profile: "不要替换正文中的 Eden child old-parent", ageDays: 140, growthStartSerialDay: 12345,
		innate: { appearance: 81, fitness: 77, intelligence: 65 }, affection: 86,
		training: { skills: { knowledge: 90, awareness: 88 }, lastProcessedDay: 99, plannedSchedule: ["history"] },
		adult: { settled: true, career: "engineer", settledDay: 80, lastRemittanceMonth: 24300,
			encounter: { persistentKey: `eden_child:${id}`, count: 5 },
			lifeStory: { status: "read", dueDay: 90, content: { dailyLife: "Eden child old-parent is a historical phrase" }, inputSnapshot: { childId: id, name: "历史名字" } },
		}, ...fields,
	};
}

function legacySave() {
	return {
		children: { "old-parent": legacyChild("old-parent"), "old-twin": legacyChild("old-twin") },
		eden: { schemaVersion: 17, children: { "old-parent": record("old-parent"), "old-twin": record("old-twin") },
			selectedChildId: "old-parent", activeEncounterChildId: "old-twin", bedVisit: { activeChildId: "old-parent" },
			breeding: { parentsByDescription: { "Eden child old-parent": "old-parent" }, activeBirthParentId: "old-parent", lastBirthResult: { parentId: "old-parent", childIds: ["old-twin"] } },
			facility: { owned: true, capacity: 6 }, settings: { maturityDays: 90 },
		},
		per_npc: { "eden_child:old-parent": { per: "eden_child:old-parent", fullDescription: "Eden child old-parent", virginity: { vaginal: false } } },
		NPCList: [{ per: "eden_child:old-parent", edenChildId: "old-parent", fullDescription: "Eden child old-parent" }],
		storedNPCs: {}, NPCNameList: [], NPCName: [], objectVersion: {}, settings: { humanPregnancyMonths: 3, wolfPregnancyWeeks: 4, birdPregnancyWeeks: 4 },
	};
}

function installNative(f) {
	const patched = f.api.patchSource(native);
	assert.notEqual(patched, native);
	assert.match(patched, /captureChildMap\(oldKeyToNewId\)/);
	vm.runInContext(patched, f.context);
	// Reuse the native functions, supplying only the unrelated base-species classifier.
	f.context.childBaseSpecies = species => ["wolfboy", "wolfgirl"].includes(species) ? "wolf" : species === "harpy" ? "hawk" : species;
	return () => vm.runInContext("migratePregnancyData()", f.context);
}

function portableNativeConversion(f, mutate = () => {}) {
	return f.api.runNativeMigration(() => {
		f.vars.pregnancies = [];
		f.vars.childRecords = Object.keys(f.vars.children || {}).map((id, childId) => ({ childId, pregnancyId: 0, species: "human", development: { location: f.vars.children[id].location } }));
		f.api.captureChildMap(Object.fromEntries(Object.keys(f.vars.children || {}).map((id, index) => [id, index])));
		mutate();
		delete f.vars.children;
		f.vars.objectVersion = { pregnancyRecords: 1 };
	});
}

test("0.5.11 scripts and saves are unchanged, and fresh record saves are marked once", () => {
	const f = fixture(legacySave());
	assert.equal(f.api.patchSource(f.script.textContent), f.script.textContent);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(f.vars.eden.recordsMigration, undefined);
	const fresh = fixture({ childRecords: [], pregnancies: [], eden: { children: {}, selectedChildId: null } });
	assert.equal(fresh.api.ensureReady(), true);
	const marker = fresh.vars.eden.recordsMigration;
	assert.equal(fresh.api.ensureReady(), true);
	assert.equal(fresh.vars.eden.recordsMigration, marker);
});

test("exact mapping rewrites zero, persistent NPCs and references without resetting progress or prose", () => {
	const f = fixture(legacySave());
	const original = structuredClone(f.vars.eden.children["old-parent"]);
	portableNativeConversion(f);
	const parent = f.vars.eden.children["0"];
	assert.equal(parent.childId, "0");
	assert.equal(f.vars.eden.selectedChildId, "0");
	assert.equal(f.vars.eden.bedVisit.activeChildId, "0");
	assert.equal(f.vars.eden.breeding.parentsByDescription["Eden child 0"], "0");
	assert.equal(f.vars.eden.breeding.lastBirthResult.childIds[0], "1");
	assert.equal(parent.adult.encounter.persistentKey, "eden_child:0");
	assert.equal(f.vars.per_npc["eden_child:0"].virginity.vaginal, false);
	assert.equal(f.vars.NPCList[0].edenChildId, "0");
	assert.deepEqual(parent.training, original.training);
	assert.deepEqual(parent.innate, original.innate);
	assert.equal(parent.affection, original.affection);
	assert.equal(parent.growthStartSerialDay, original.growthStartSerialDay);
	assert.equal(parent.adult.lastRemittanceMonth, original.adult.lastRemittanceMonth);
	assert.deepEqual(parent.adult.lifeStory, original.adult.lifeStory);
	assert.equal(parent.profile, original.profile);
	assert.deepEqual(f.vars.eden.recordsMigration.legacyBackup.eden.children["old-parent"], original);
});

test("missing map rolls back both native and mod data, and a later retry can succeed", () => {
	const f = fixture(legacySave());
	f.vars.eden.children.orphan = record("orphan");
	const before = structuredClone(f.vars);
	assert.throws(() => portableNativeConversion(f), /无法关联旧孩子编号 orphan/);
	const errorMarker = f.vars.eden.recordsMigration;
	assert.equal(errorMarker.status, "failed");
	delete f.vars.eden.recordsMigration;
	assert.deepEqual(f.vars, before);
	delete f.vars.eden.children.orphan;
	portableNativeConversion(f);
	assert.equal(f.vars.eden.recordsMigration.status, "complete");
});

test("shared current and persistent NPC objects are rebound only once", () => {
	const vars = legacySave();
	vars.NPCList = [vars.per_npc["eden_child:old-parent"]];
	const f = fixture(vars);
	portableNativeConversion(f);
	assert.equal(f.vars.NPCList[0], f.vars.per_npc["eden_child:0"]);
	assert.equal(f.vars.NPCList[0].fullDescription, "Eden child 0");
});

test("native failures and reference conflicts preserve the pre-upgrade state", () => {
	const f = fixture(legacySave());
	assert.throws(() => f.api.runNativeMigration(() => { f.vars.money = 0; throw new Error("native failure"); }), /native failure/);
	assert.equal(f.vars.money, undefined);
	assert.ok(f.vars.children["old-parent"]);
	delete f.vars.eden.recordsMigration;
	f.vars.eden.children["old-parent"].geneticParentId = "missing-parent";
	assert.throws(() => portableNativeConversion(f), /missing-parent/);
	assert.equal(f.vars.eden.children["old-parent"].geneticParentId, "missing-parent");
});

test("already-converted saves are preserved and request recovery instead of matching by name", () => {
	const vars = legacySave();
	delete vars.children;
	vars.childRecords = [{ childId: 0, name: "同名" }, { childId: 1, name: "同名" }];
	const f = fixture(vars);
	assert.equal(f.api.ensureReady(), false);
	assert.equal(f.vars.eden.recordsMigration.status, "needsRecovery");
	assert.ok(f.vars.eden.children["old-parent"]);
	assert.equal(f.vars.eden.selectedChildId, "old-parent");
});

test("an empty child registry with an unresolved bed-visit reference is not treated as a fresh save", () => {
	const f = fixture({ childRecords: [], pregnancies: [], eden: { children: {}, bedVisit: { activeChildId: "missing" } } });
	assert.equal(f.api.ensureReady(), false);
	assert.equal(f.vars.eden.bedVisit.activeChildId, "missing");
});

test("native conversion without a completion marker rolls back", () => {
	const f = fixture(legacySave());
	assert.throws(() => f.api.runNativeMigration(() => {
		f.vars.childRecords = [];
		f.vars.pregnancies = [];
		delete f.vars.children;
	}), /原版存档转换没有完成/);
	assert.ok(f.vars.children["old-parent"]);
});

test("a changed native hook fails closed before deleting legacy data", () => {
	const f = fixture(legacySave());
	const unsupported = "function migratePregnancyData() { delete V.children; V.objectVersion = {pregnancyRecords:1}; }";
	vm.runInContext(f.api.patchSource(unsupported), f.context);
	assert.throws(() => vm.runInContext("migratePregnancyData()", f.context), /原版迁移接口发生变化/);
	assert.ok(f.vars.children["old-parent"]);
	assert.equal(f.vars.objectVersion.pregnancyRecords, undefined);
});

test("actual 0.5.12 migration captures IDs, same-name twins and the zero identical group; reload is idempotent", actualRuntime, () => {
	const f = fixture(legacySave());
	const run = installNative(f);
	run();
	assert.equal(f.vars.children, undefined);
	assert.equal(f.vars.childRecords[0].identical, 0);
	assert.equal(f.vars.childRecords[1].identical, 0);
	assert.equal(f.vars.childRecords[0].development.location, "eden_home");
	assert.equal(f.vars.eden.children["0"].profile, "不要替换正文中的 Eden child old-parent");
	const after = JSON.stringify(f.vars);
	run();
	assert.equal(JSON.stringify(f.vars), after);
	const reloaded = fixture(JSON.parse(after));
	installNative(reloaded)();
	assert.equal(JSON.stringify(reloaded.vars), after);
});

test("the complete shipped user script can be patched once and remains valid JavaScript", actualRuntime, () => {
	const html = fs.readFileSync(runtimePath, "utf8");
	const source = html.match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1];
	const f = fixture();
	const patched = f.api.patchSource(source);
	assert.match(patched, /captureChildMap\(oldKeyToNewId\)/);
	assert.doesNotMatch(patched, /原版迁移接口发生变化/);
	assert.equal(f.api.patchSource(patched), patched);
	new vm.Script(patched);
});

test("a native save without Eden is still upgraded normally", actualRuntime, () => {
	const vars = legacySave();
	delete vars.eden;
	delete vars.per_npc;
	delete vars.NPCList;
	const f = fixture(vars);
	installNative(f)();
	assert.equal(f.vars.childRecords.length, 2);
	assert.equal(f.vars.eden, undefined);
});

test("actual mapping follows native litter grouping, including unrelated children, and restores inherited links", actualRuntime, () => {
	const vars = legacySave();
	vars.children = {
		unrelated: legacyChild("unrelated", { mother: "Alex", father: "someone", birthId: 9 }),
		"old-parent": vars.children["old-parent"],
		grandchild: legacyChild("grandchild", { mother: "pc", father: "Eden child old-parent", birthId: 1, edenGeneticParentId: "old-parent" }),
		"old-twin": vars.children["old-twin"],
	};
	vars.eden.children.grandchild = record("grandchild", { geneticParentId: "old-parent", innate: { inheritedFrom: "old-parent", fitness: 88 } });
	const f = fixture(vars);
	installNative(f)();
	assert.equal(f.vars.eden.recordsMigration.childMap["old-parent"], 1);
	assert.equal(f.vars.eden.recordsMigration.childMap["old-twin"], 2);
	assert.equal(f.vars.eden.recordsMigration.childMap.grandchild, 3);
	assert.equal(f.vars.eden.children["3"].geneticParentId, "1");
	assert.equal(f.vars.eden.children["3"].innate.inheritedFrom, "1");
	assert.equal(f.vars.childRecords[3].edenGeneticParentId, "1");
	assert.equal(f.vars.pregnancies[2].donor, "Eden child 1");
});

test("laid eggs preserve their hatch state, adopted location and rearing data", actualRuntime, () => {
	const vars = legacySave();
	vars.children.egg = legacyChild("egg", { type: "hawk", birthId: 2, mother: "pc", father: "Great Hawk", laid: { day: 2, month: "January", year: 2026 }, location: "tower", eggTimer: 2000000000, adopted: { day: 3, month: "January", year: 2026 } });
	vars.eden.children.egg = record("egg", { adult: null });
	const f = fixture(vars);
	installNative(f)();
	const egg = f.vars.childRecords[2];
	assert.equal(egg.bornDate, null);
	assert.equal(egg.species, "hawk");
	assert.equal(egg.development.location, "tower");
	assert.equal(egg.development.interactionsTotal, 15);
	assert.equal(typeof egg.development.adoptedDate, "number");
	assert.equal(f.vars.eden.children["2"].growthStartSerialDay, 12345);
});

test("actual native PC pregnancy migration preserves the custom genetic parent of unborn children", actualRuntime, () => {
	const vars = legacySave();
	vars.sexStats = { vagina: { pregnancy: { type: "human", timer: 45, timerEnd: 90, fetus: [legacyChild("pending", { father: "Eden child old-parent", edenGeneticParentId: "old-parent" })] } }, anus: { pregnancy: { fetus: [] } } };
	const f = fixture(vars);
	installNative(f)();
	const unborn = f.vars.childRecords[2];
	assert.equal(unborn.bornDate, null);
	assert.equal(unborn.edenGeneticParentId, "0");
	assert.equal(f.vars.eden.recordsMigration.childMap.pending, 2);
	assert.equal(f.vars.pregnancies[1].donor, "Eden child 0");
	assert.equal(f.vars.eden.children["2"], undefined);
});

test("mod-owned pregnancies become native records at the same progress, including twins and retry state", actualRuntime, () => {
	const vars = legacySave();
	const fetus = legacyChild("pending-a", { mother: "Eden child old-parent", father: "pc", edenGeneticParentId: "old-parent" });
	vars.eden.children["old-parent"].adult.pregnancy = { type: "human", timer: 45, timerEnd: 90, fetus: [fetus, { ...fetus, childId: "pending-b" }], due: false, deliveryBlocked: true, lastDeliveryError: "retry", givenBirth: 2, totalBirthEvents: 3 };
	const f = fixture(vars);
	installNative(f)();
	const descriptor = f.vars.eden.children["0"].adult.pregnancy;
	assert.equal(descriptor.pregnancyId, 1);
	assert.equal(descriptor.deliveryBlocked, true);
	assert.equal(descriptor.lastDeliveryError, "retry");
	assert.equal(descriptor.totalBirthEvents, 3);
	assert.equal(descriptor.fetus, undefined);
	const pregnancy = f.vars.pregnancies[1];
	assert.equal(pregnancy.carrier, "Eden child 0");
	assert.equal(pregnancy.donor, "pc");
	assert.equal((f.context.Time.date.timeStamp - pregnancy.conceivedDate) / f.context.window.gestationSeconds("human"), 0.5);
	assert.equal(f.vars.childRecords.length, 4);
	assert.equal(f.vars.childRecords[2].edenGeneticParentId, "0");
	assert.equal(f.vars.childRecords[3].identical, 1);
	assert.equal(f.vars.eden.recordsMigration.adultPregnancies, 1);
	assert.equal(f.vars.eden.recordsMigration.legacyBackup.eden.children["old-parent"].adult.pregnancy.timer, 45);
});

test("invalid mod pregnancy restores the native arrays and legacy save together", actualRuntime, () => {
	const vars = legacySave();
	vars.eden.children["old-parent"].adult.pregnancy = { type: "human", timer: 45, timerEnd: 0, fetus: [legacyChild("pending")] };
	const f = fixture(vars);
	const before = structuredClone(vars);
	assert.throws(installNative(f), /模组孕期进度无效/);
	delete f.vars.eden.recordsMigration;
	assert.deepEqual(f.vars, before);
});

test("duplicate fetus identities abort without losing or overwriting the legacy pregnancy", actualRuntime, () => {
	const vars = legacySave();
	const fetus = legacyChild("duplicate", { father: "pc" });
	vars.eden.children["old-parent"].adult.pregnancy = { type: "human", timer: 45, timerEnd: 90, fetus: [fetus, { ...fetus }] };
	const f = fixture(vars);
	assert.throws(installNative(f), /同胎孩子的编号或种族资料不完整/);
	assert.equal(f.vars.eden.children["old-parent"].adult.pregnancy.fetus.length, 2);
	assert.equal(f.vars.childRecords, undefined);
});

test("due mod pregnancies keep their due date and repeated calls do not create another litter", actualRuntime, () => {
	const vars = legacySave();
	vars.eden.children["old-parent"].adult.pregnancy = { type: "hawk", timer: 40, timerEnd: 28, due: true, fetus: [legacyChild("egg-pending", { type: "hawk", father: "pc", mother: "Eden child old-parent" })] };
	const f = fixture(vars);
	const run = installNative(f);
	run();
	const descriptor = f.vars.eden.children["0"].adult.pregnancy;
	assert.equal(descriptor.due, true);
	assert.equal(f.context.window.getDueDate(f.vars.pregnancies[descriptor.pregnancyId]), f.context.Time.date.timeStamp);
	const counts = [f.vars.pregnancies.length, f.vars.childRecords.length];
	run();
	assert.deepEqual([f.vars.pregnancies.length, f.vars.childRecords.length], counts);
});

test("stored NPC and mod copies of the same pregnancy are linked once and leave native automatic birth ownership", actualRuntime, () => {
	const vars = legacySave();
	const pregnancy = { type: "human", timer: 45, timerEnd: 90, fetus: [legacyChild("pending", { mother: "Eden child old-parent", father: "pc" })] };
	vars.eden.children["old-parent"].adult.pregnancy = structuredClone(pregnancy);
	vars.storedNPCs.pregnancy_0 = { npc: { fullDescription: "Eden child old-parent", type: "human" }, pregnancy };
	const f = fixture(vars);
	installNative(f)();
	assert.equal(f.vars.pregnancies.length, 2);
	assert.equal(f.vars.childRecords.length, 3);
	assert.equal(f.vars.eden.children["0"].adult.pregnancy.pregnancyId, 1);
	assert.equal(f.vars.pregnancies[1].carrier, "Eden child 0");
	assert.equal(f.vars.storedNPCs.pregnancy_0, undefined);
});

function recoverableSave() {
	const ids = ["m0b0d1f0", "m0b1d1f1"];
	const vars = JSON.parse(JSON.stringify(legacySave()).replaceAll("old-parent", ids[0]).replaceAll("old-twin", ids[1]));
	vars.parentList = {
		mothers: [{ id: 0, name: "pc", kids: 2, births: 1 }],
		fathers: [{ id: 0, name: "pc", kids: 0 }, { id: 1, name: "Robin", kids: 2 }],
	};
	for (const id of ids) vars.eden.children[id].innate.groupKey = "identical|pc|Robin|0|human|2025-October-1|2026-January-1";
	return vars;
}

function convertWithoutEdenHook(vars) {
	const f = fixture(vars);
	vm.runInContext(native, f.context);
	f.context.childBaseSpecies = species => ["wolfboy", "wolfgirl"].includes(species) ? "wolf" : species === "harpy" ? "hawk" : species;
	vm.runInContext("migratePregnancyData()", f.context);
	assert.equal(vars.children, undefined);
	assert.equal(vars.eden.recordsMigration, undefined);
	return f;
}

test("already-converted identical twins recover via parent counters and dates, preserve records and reload once", actualRuntime, () => {
	const vars = recoverableSave();
	const oldEden = structuredClone(vars.eden);
	const f = convertWithoutEdenHook(vars);
	const nativeBefore = structuredClone(vars.childRecords);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(vars.eden.recordsMigration.source, "0.5.12-recovery");
	assert.equal(vars.eden.recordsMigration.recovery.method, "parent-census");
	assert.equal(vars.eden.recordsMigration.childMap.m0b0d1f0, 0);
	assert.equal(vars.eden.recordsMigration.childMap.m0b1d1f1, 1);
	assert.equal(vars.eden.selectedChildId, "0");
	assert.equal(vars.eden.children[0].profile, oldEden.children.m0b0d1f0.profile);
	assert.equal(vars.eden.children[0].training.skills.knowledge, 90);
	assert.equal(vars.eden.children[0].adult.lifeStory.inputSnapshot.childId, "m0b0d1f0");
	assert.equal(vars.eden.children[1].affection, 86);
	assert.equal(vars.per_npc["eden_child:0"].virginity.vaginal, false);
	assert.deepEqual(structuredClone(vars.childRecords), nativeBefore);
	assert.deepEqual(vars.eden.recordsMigration.legacyBackup.eden, oldEden);
	assert.deepEqual(vars.eden.recordsMigration.legacyBackup.records.childRecords, nativeBefore);
	const after = JSON.stringify(vars);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(JSON.stringify(vars), after);
	const reloaded = fixture(JSON.parse(after));
	assert.equal(reloaded.api.ensureReady(), true);
	assert.equal(JSON.stringify(reloaded.vars), after);
});

test("recovery follows conception order rather than the native array's birth order", actualRuntime, () => {
	const vars = recoverableSave();
	for (const child of Object.values(vars.children)) child.features.identical = false;
	vars.children.m0b0d1f0.conceived = { year: 2025, month: "September", day: 1 };
	vars.children.m0b1d1f1.conceived = { year: 2025, month: "October", day: 1 };
	vars.children = { m0b1d1f1: vars.children.m0b1d1f1, m0b0d1f0: vars.children.m0b0d1f0 };
	for (const record of Object.values(vars.eden.children)) delete record.innate.groupKey;
	const f = convertWithoutEdenHook(vars);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(vars.eden.recordsMigration.childMap.m0b0d1f0, 1);
	assert.equal(vars.eden.recordsMigration.childMap.m0b1d1f1, 0);
	assert.equal(vars.eden.selectedChildId, "1");
});

function addRecoveryPregnancy(vars, stored = false) {
	vars.parentList.mothers.push({ id: 1, name: "Eden child m0b0d1f0", kids: 2, births: 0 });
	vars.parentList.fathers[0].kids = 2;
	const pregnancy = { type: "human", timer: 45, timerEnd: 90, due: true, deliveryBlocked: true, lastDeliveryError: "retry",
		fetus: [legacyChild("m1b0d0f0", { mother: "Eden child m0b0d1f0", father: "pc", edenGeneticParentId: "m0b0d1f0" }),
			legacyChild("m1b1d0f1", { mother: "Eden child m0b0d1f0", father: "pc", edenGeneticParentId: "m0b0d1f0" })] };
	vars.eden.children.m0b0d1f0.adult.pregnancy = structuredClone(pregnancy);
	if (stored) vars.storedNPCs.pregnancy_0 = { npc: { fullDescription: "Eden child m0b0d1f0", type: "human" }, pregnancy };
}

for (const stored of [false, true]) test(`recovery preserves adult pregnancy progress and twins (${stored ? "native stored copy" : "mod-only copy"})`, actualRuntime, () => {
	const vars = recoverableSave();
	addRecoveryPregnancy(vars, stored);
	const f = convertWithoutEdenHook(vars);
	assert.equal(vars.childRecords.length, stored ? 4 : 2);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(vars.childRecords.length, 4);
	assert.equal(vars.pregnancies.length, 2);
	assert.equal(vars.eden.recordsMigration.childMap.m1b0d0f0, 2);
	assert.equal(vars.eden.recordsMigration.childMap.m1b1d0f1, 3);
	assert.equal(vars.eden.recordsMigration.recovery.anchoredFetuses, stored ? 2 : 0);
	assert.equal(vars.eden.recordsMigration.recovery.reservedFetuses, stored ? 0 : 2);
	const descriptor = vars.eden.children[0].adult.pregnancy;
	assert.equal(descriptor.pregnancyId, 1);
	assert.equal(descriptor.due, true);
	assert.equal(descriptor.deliveryBlocked, true);
	assert.equal(descriptor.lastDeliveryError, "retry");
	assert.equal(vars.pregnancies[1].carrier, "Eden child 0");
	assert.equal(vars.childRecords[2].edenGeneticParentId, "0");
	assert.equal(vars.childRecords[3].edenGeneticParentId, "0");
	assert.equal(vars.storedNPCs.pregnancy_0, undefined);
	const after = JSON.stringify(vars);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(JSON.stringify(vars), after);
});

for (const problem of ["counter-gap", "new-child", "duplicate-parent", "wrong-twin-date", "dangling-reference", "invalid-pregnancy", "unknown-inflight"]) {
	test(`recovery fails atomically and can retry after ${problem}`, actualRuntime, () => {
		const vars = recoverableSave();
		if (problem === "invalid-pregnancy") addRecoveryPregnancy(vars);
		if (problem === "unknown-inflight") {
			vars.parentList.mothers[0].kids++;
			vars.parentList.fathers[1].kids++;
			vars.sexStats = { vagina: { pregnancy: { type: "human", timer: 45, timerEnd: 90,
				fetus: [legacyChild("m0b2d1f2")] } } };
		}
		const f = convertWithoutEdenHook(vars);
		const supported = structuredClone(vars);
		if (problem === "counter-gap") vars.parentList.mothers[0].kids++;
		if (problem === "new-child") vars.childRecords.push({ ...vars.childRecords[0], childId: 2 });
		if (problem === "duplicate-parent") vars.parentList.fathers.push({ ...vars.parentList.fathers[1], id: 2 });
		if (problem === "wrong-twin-date") vars.eden.children.m0b0d1f0.innate.groupKey = "identical|pc|Robin|0|human|2024-October-1|2026-January-1";
		if (problem === "dangling-reference") vars.eden.bedVisit.activeChildId = "missing";
		if (problem === "invalid-pregnancy") vars.eden.children.m0b0d1f0.adult.pregnancy.timerEnd = 0;
		const before = structuredClone(vars);
		for (let attempt = 0; attempt < 2; attempt++) {
			assert.equal(f.api.ensureReady(), false);
			assert.equal(vars.eden.recordsMigration.status, "needsRecovery");
			assert.ok(vars.eden.recordsMigration.error);
			const actual = structuredClone(vars);
			delete actual.eden.recordsMigration;
			assert.deepEqual(actual, before);
		}
		if (problem !== "unknown-inflight") {
			for (const key of Object.keys(vars)) delete vars[key];
			Object.assign(vars, supported);
			assert.equal(f.api.ensureReady(), true);
		}
	});
}

test("same-day separate litters with the same parents are ambiguous even when child names differ", actualRuntime, () => {
	const vars = recoverableSave();
	vars.children.m0b1d1f1.birthId = 1;
	vars.children.m0b1d1f1.name = "另一个名字";
	for (const record of Object.values(vars.eden.children)) delete record.innate.groupKey;
	const f = convertWithoutEdenHook(vars);
	assert.equal(f.api.ensureReady(), false);
	assert.match(vars.eden.recordsMigration.error, /同一天/);
	assert.equal(vars.eden.selectedChildId, "m0b0d1f0");
});

test("a sole rescued hawk has its special legacy ID recovered", actualRuntime, () => {
	const vars = recoverableSave();
	const hawk = legacyChild("orphanHawk1", { type: "hawk", mother: "unknown hawk", father: "unknown hawk",
		laid: { year: 2025, month: "December", day: 1 }, features: {}, birthId: 0 });
	vars.children.orphanHawk1 = hawk;
	vars.eden.children.orphanHawk1 = record("orphanHawk1");
	const f = convertWithoutEdenHook(vars);
	assert.equal(f.api.ensureReady(), true);
	assert.equal(vars.eden.recordsMigration.childMap.orphanHawk1, 2);
	assert.equal(vars.eden.children[2].childId, "2");
});

test("a new child cannot fill a lost legacy counter and masquerade as the old registered child", actualRuntime, () => {
	const vars = recoverableSave();
	// Counter 0 belonged to a lost, unregistered pregnancy; counter 1 is the old child.
	delete vars.children.m0b0d1f0;
	delete vars.eden.children.m0b0d1f0;
	vars.eden.selectedChildId = "m0b1d1f1";
	vars.eden.activeEncounterChildId = null;
	vars.eden.bedVisit = {};
	vars.eden.breeding = {};
	vars.per_npc = {};
	vars.NPCList = [];
	delete vars.eden.children.m0b1d1f1.innate.groupKey;
	const f = convertWithoutEdenHook(vars);
	const nativeNewPregnancy = f.context.window.pushPregnancyRecord({ carrier: "pc", donor: "Robin", donorSpecies: "human",
		conceivedDate: Date.UTC(2026, 2, 1) / 1000, deliveredDate: Date.UTC(2026, 5, 1) / 1000 });
	f.context.window.pushChildRecord({ pregnancyId: nativeNewPregnancy, species: "human", gender: "f", features: {},
		bornDate: Date.UTC(2026, 5, 1) / 1000, development: {} });
	const before = JSON.stringify(vars.childRecords);
	assert.equal(f.api.ensureReady(), false);
	assert.match(vars.eden.recordsMigration.error, /旧登记/);
	assert.equal(JSON.stringify(vars.childRecords), before);
	assert.ok(vars.eden.children.m0b1d1f1);
});

test("merged same-day pregnancies with reversed counter order fail the old sibling-order check", actualRuntime, () => {
	const vars = recoverableSave();
	for (const child of Object.values(vars.children)) child.features.identical = false;
	for (const record of Object.values(vars.eden.children)) delete record.innate.groupKey;
	vars.children = { m0b1d1f1: vars.children.m0b1d1f1, m0b0d1f0: vars.children.m0b0d1f0 };
	vars.eden.children = { m0b1d1f1: vars.eden.children.m0b1d1f1, m0b0d1f0: vars.eden.children.m0b0d1f0 };
	const f = convertWithoutEdenHook(vars);
	assert.equal(f.api.ensureReady(), false);
	assert.match(vars.eden.recordsMigration.error, /旧登记顺序/);
});

for (const stored of [false, true]) test(`duplicate fetal counter slots are rejected (${stored ? "converted copy" : "reserved copy"})`, actualRuntime, () => {
	const vars = recoverableSave();
	addRecoveryPregnancy(vars, stored);
	vars.parentList.mothers[1].kids = 1;
	vars.eden.children.m0b0d1f0.adult.pregnancy.fetus[1].childId = "m1b0d0f1";
	if (stored) vars.storedNPCs.pregnancy_0.pregnancy.fetus[1].childId = "m1b0d0f1";
	const f = convertWithoutEdenHook(vars);
	const before = JSON.stringify(vars.childRecords);
	assert.equal(f.api.ensureReady(), false);
	assert.match(vars.eden.recordsMigration.error, /计数重复/);
	assert.equal(JSON.stringify(vars.childRecords), before);
	assert.equal(vars.eden.children.m0b0d1f0.adult.pregnancy.fetus.length, 2);
});
