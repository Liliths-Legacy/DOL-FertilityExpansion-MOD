const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const modules = path.join(__dirname, "../mods/FertilityExpansion/modules");
const runtime = process.env.DOL_0512_HTML || path.resolve(__dirname, "../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html");
const source = fs.existsSync(runtime) ? fs.readFileSync(runtime, "utf8").match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1] : null;
function nativeFile(name) {
	const headers = [...source.matchAll(/\/\* twine-user-script #\d+: "([^"]+)" \*\//g)];
	const i = headers.findIndex(h => h[1].endsWith("\\" + name));
	assert.ok(i >= 0, name);
	return source.slice(headers[i].index + headers[i][0].length, headers[i + 1]?.index ?? source.length);
}
function fixture() {
	const settings = { maturityDays: 90, allowHumanDescendants: true };
	const v = { cheatsEnabled: true, feats: { locked: false }, eden: { children: {}, settings, facility: { owned: true, capacity: 3 } }, options: { eden: settings },
		settings: { humanPregnancyMonths: 3, wolfPregnancyWeeks: 4, birdPregnancyWeeks: 4 }, NPCList: [], childRecords: [], pregnancies: [],
		sexStats: {}, money: 90000, player: { gender: "f" } };
	const c = vm.createContext({ V: v, structuredClone, clone: structuredClone, console, ConstantsLoader: { init: x => x }, DefineMacro() {} });
	c.window = c;
	c.SugarCube = { State: { variables: v } };
	vm.runInContext("Math.clamp = (v, a, b) => Math.min(b, Math.max(a, v));", c);
	if (source) {
		for (const name of ["00-time-constants.js", "datetime.js", "pregnancy-constants.js", "pregnancy-records.js", "child-generator.js"]) vm.runInContext(nativeFile(name), c);
	} else {
		c.DateTime = class { constructor(t) { const d = new Date(t * 1000); this.year = d.getUTCFullYear(); this.month = d.getUTCMonth() + 1; this.day = d.getUTCDate(); this.timeStamp = t; } };
	}
	const born = source ? new c.DateTime(2026, 1, 1).timeStamp : Date.UTC(2026, 0, 1) / 1000;
	c.Time = { date: new c.DateTime(born + 40 * 86400), year: 2026, month: 2, monthDay: 10, days: 40, hour: 9 };
	for (const name of ["eden-child-data", "eden-child-removal", "eden-facility", "eden-age", "eden-traits", "eden-training", "eden-adult", "eden-life-story", "eden-chat", "eden-cheats"]) vm.runInContext(fs.readFileSync(path.join(modules, name + ".js"), "utf8"), c);
	v.pregnancies.push({ pregnancyId: 0, carrier: "pc", donor: "unknown", donorSpecies: "human", conceivedDate: born - 100 * 86400, deliveredDate: born });
	const child = { childId: 0, pregnancyId: 0, species: "human", gender: "f", bornDate: born, identical: null, name: "测试", features: { beastTransform: "fox", hairColour: "brown", eyeColour: "green", skinColour: "light", size: "normal" }, development: { location: "eden_home", interactionsTotal: 17 } };
	v.childRecords.push(child);
	c.EdenChildData.syncRegistry(v.eden);
	const record = v.eden.children[0];
	c.EdenAge.syncRecord(record, child, settings);
	c.EdenTraits.syncRecord(record, child, "0", v);
	c.EdenTraining.syncRecord(record, child, settings);
	c.EdenAdult.syncRecord(record, child);
	const patch = () => ({ ...c.EdenCheats.identity(child), ...Object.fromEntries(["appearance", "fitness", "intelligence", "temperament"].map(k => [k, record.innate[k]])) });
	return { c, v, child, record, api: c.EdenCheats, patch };
}

test("all mutations require cheats and safe game state; failures leave state intact", () => {
	for (const change of [v => v.cheatsEnabled = false, v => v.statFreeze = true, v => v.combat = 1, v => v.possessed = true, v => v.NPCList.push({ type: "human" })]) {
		const f = fixture(); change(f.v); const before = JSON.stringify(f.v);
		for (const action of [() => f.api.labour(), () => f.api.parasites(true), () => f.api.parasites(false), () => f.api.saveInnate(0, f.patch()), () => f.api.saveSkills(0, {}), () => f.api.reset(0), () => f.api.settleAdult(0), () => f.api.removeChild(0)]) assert.equal(action().ok, false);
		assert.equal(JSON.stringify(f.v), before);
	}
});
test("native menu access permits actions without the save cheat flag, but closing revokes it", () => {
	const f = fixture(); f.v.cheatsEnabled = false;
	let hidden = false, content = true;
	const overlay = { dataset: { overlay: "cheats" }, closest: () => hidden ? {} : null, querySelector: () => content ? {} : null };
	f.c.document = { getElementById: id => id === "customOverlay" ? overlay : null };
	assert.equal(f.api.saveSkills(0, { knowledge: 25, fitness: 0, social: 0, awareness: 0 }).ok, true);
	assert.equal(f.v.cheatsEnabled, false);
	hidden = true;
	const before = JSON.stringify(f.v);
	assert.equal(f.api.reset(0).ok, false);
	assert.equal(JSON.stringify(f.v), before);
	hidden = false; content = false;
	assert.equal(f.api.available(), false);
	content = true; overlay.dataset.overlay = "options";
	assert.equal(f.api.available(), false);
});
test("name recommendations prioritize exact, prefix, substring and ordered fuzzy matches", () => {
	const f = fixture();
	f.v.childRecords = ["小花", "小花儿", "大花", "小雪花", "ＡＬＩＣＥ", "花小"].map((name, childId) => ({ ...structuredClone(f.child), name, childId }));
	f.c.EdenChildData.syncRegistry(f.v.eden);
	assert.equal(f.api.children(" 小 花 ").map(([id]) => id).join(","), "0,1,3");
	assert.equal(f.api.children("alice")[0][0], "4");
	assert.equal(f.api.children("不存在").length, 0);
});
test("instant adulthood preserves current attributes, skips training costs, and survives neverAutoAdult", () => {
	const f = fixture();
	f.v.eden.settings.neverAutoAdult = true;
	f.record.training.skills = { knowledge: 90, fitness: 80, social: 80, awareness: 90 };
	f.record.training.repeatSchedule.fill("study"); f.record.training.lastProcessedDay -= 20;
	const skills = JSON.stringify(f.record.training.skills), innate = JSON.stringify(f.record.innate), born = f.child.bornDate;
	assert.equal(f.api.settleAdult(0).ok, true);
	assert.equal(f.record.adult.settled, true); assert.equal(f.record.adult.education, "university");
	assert.equal(f.record.ageDays, f.record.stageThresholds.adult);
	f.c.EdenAge.syncRecord(f.record, f.child, f.v.eden.settings);
	f.c.EdenTraining.syncRecord(f.record, f.child, f.v.eden.settings);
	assert.equal(f.record.lifeStage, "adult");
	assert.equal(JSON.stringify(f.record.training.skills), skills);
	assert.equal(JSON.stringify(f.record.innate), innate);
	assert.equal(f.child.bornDate, born); assert.equal(f.v.money, 90000);
	assert.equal(f.child.development.location, "eden_contacts");
});
test("re-settlement clears adult results and all adult LLM memory while retaining pregnancy and profile", () => {
	const f = fixture();
	assert.equal(f.api.settleAdult(0).ok, true);
	f.record.profile = "手写简介";
	f.record.adult.pregnancy = { pregnancyId: 9, edenParentChildId: "0" };
	f.record.adult.lifeStory = { generationToken: "old", content: { letter: "old letter" }, inputSnapshot: { old: true } };
	f.record.adult.encounter = { count: 9 };
	f.record.chat = { background: "old background", characterCard: "old card", history: ["old message"], experiences: ["old experience"], incoming: ["pending"] };
	f.record.training.skills = { knowledge: 100, fitness: 100, social: 100, awareness: 100 };
	assert.equal(f.api.settleAdult(0).ok, true);
	assert.equal(f.record.adult.education, "university");
	assert.equal(f.record.chat, undefined);
	assert.equal(f.record.adult.encounter, undefined);
	assert.equal(f.record.adult.lifeStory.content, null);
	assert.equal(f.record.adult.lifeStory.inputSnapshot, null);
	assert.equal(f.record.adult.lifeStory.generationToken, undefined);
	assert.equal(f.record.profile, "手写简介"); assert.equal(f.record.adult.pregnancy.pregnancyId, 9);
});
test("unsupported adult settlement and settlement failures are atomic", () => {
	const f = fixture(); f.child.species = "wolf"; f.child.features.beastTransform = null;
	let before = JSON.stringify(f.v);
	assert.equal(f.api.settleAdult(0).ok, false); assert.equal(JSON.stringify(f.v), before);
	f.child.species = "human";
	f.c.EdenAdult = { ...f.c.EdenAdult, settle: () => ({ ok: false, message: "test failure" }) };
	before = JSON.stringify(f.v);
	assert.equal(f.api.settleAdult(0).ok, false); assert.equal(JSON.stringify(f.v), before);
});
test("delete removes personal data and references without changing siblings, and stays deleted after save/load", { skip: !source }, () => {
	const f = fixture(); f.child.name = "__deleted_person__";
	const sibling = { ...structuredClone(f.child), childId: 1, name: "Eden child 0", identical: 0 };
	f.child.identical = 0; f.v.childRecords.push(sibling);
	f.c.EdenChildData.syncRegistry(f.v.eden);
	const siblingBefore = JSON.stringify(sibling), recordBefore = JSON.stringify(f.v.eden.children[1]);
	f.record.chat = { history: ["__deleted_person__"] };
	f.v.childSelected = f.child; f.v.childActivityEvent = { childid: 0, event: "crying" };
	f.v.eggsHatched = [0, 1]; f.v.eggsMoved = [1, 0];
	f.v.eden.selectedChildId = "0";
	f.v.eden.breeding = { parentsByDescription: { "Eden child 0": "0", "Eden child 1": "1" }, lastBirthResult: { parentId: "0", childIds: [1] } };
	f.v.storedNPCs = { test: { npc: { fullDescription: "Eden child 0" } }, keep: { npc: { fullDescription: "someone" } } };
	f.v.persistentNPCs = { "eden_child:0": { name: "__deleted_person__" } };
	f.v.babyIntros = { Bailey: [{ birthId: 0, children: 2 }] };
	f.v.eden.recordsMigration = { version: 1, childMap: { oldChild: 0, other: 1 }, legacyBackup: { children: { oldChild: { name: "__deleted_person__" }, other: { name: "保留" } }, eden: { children: { oldChild: { chat: { history: ["__deleted_person__"] } } } } } };
	assert.equal(f.api.removeChild("0").ok, true);
	assert.equal(JSON.stringify(sibling), siblingBefore); assert.equal(JSON.stringify(f.v.eden.children[1]), recordBefore);
	assert.equal(f.v.childSelected, undefined); assert.equal(f.v.childActivityEvent, undefined);
	assert.equal(f.v.eden.selectedChildId, undefined);
	assert.equal(f.v.eggsHatched.join(","), "1"); assert.equal(f.v.eggsMoved.join(","), "1");
	assert.equal(f.v.babyIntros.Bailey[0].children, 1);
	assert.equal(f.c.getChildrenOf(0).length, 1); assert.equal(f.c.getBornChildren().length, 1);
	assert.ok(!JSON.stringify(f.v).includes("__deleted_person__"));
	const saved = JSON.parse(JSON.stringify(f.v));
	f.c.SugarCube.State.variables = saved; f.c.V = saved;
	f.c.EdenChildData.syncRegistry(saved.eden);
	assert.equal(f.c.EdenChildData.get(0), undefined); assert.equal(saved.eden.children[0], undefined);
	assert.equal(f.c.getBornChildren().length, 1);
	assert.equal(f.c.pushChildRecord({ pregnancyId: 0, species: "human", features: {}, gender: "f" }), 2);
});
test("delete clears an ongoing carrier pregnancy but preserves born descendants and unrelated pregnancies", { skip: !source }, () => {
	const f = fixture();
	f.v.pregnancies.push({ pregnancyId: 1, carrier: "Eden child 0", donor: "pc", deliveredDate: null, conceivedDate: 100 });
	f.v.pregnancies.push({ pregnancyId: 2, carrier: "Eden child 0", donor: "pc", deliveredDate: 100, conceivedDate: 0 });
	f.v.pregnancies.push({ pregnancyId: 3, carrier: "pc", donor: "Eden child 0", deliveredDate: null, conceivedDate: 100 });
	f.v.childRecords.push({ ...structuredClone(f.child), childId: 1, pregnancyId: 1, bornDate: null });
	f.v.childRecords.push({ ...structuredClone(f.child), childId: 2, pregnancyId: 2, edenGeneticParentId: "0" });
	f.v.childRecords.push({ ...structuredClone(f.child), childId: 3, pregnancyId: 3, bornDate: null });
	f.c.EdenChildData.syncRegistry(f.v.eden);
	assert.equal(f.api.removeChild(0).ok, true);
	assert.equal(f.v.pregnancies[0].carrier, "cleared"); assert.equal(f.v.pregnancies[1].carrier, "cleared");
	assert.equal(f.v.pregnancies[2].carrier, "unknown"); assert.equal(f.v.pregnancies[3].donor, "unknown");
	assert.equal(f.c.EdenChildData.get(1), undefined);
	assert.equal(f.c.EdenChildData.get(2).edenGeneticParentId, undefined);
	assert.ok(f.c.EdenChildData.get(3)); assert.equal(f.c.getBornChildren().length, 1);
});
test("pending LLM letters cannot restore old adulthood data after re-settlement or deletion", async () => {
	for (const action of ["settleAdult", "removeChild", "reset"]) {
		const f = fixture(); f.record.training.skills = { knowledge: 100, fitness: 100, social: 100, awareness: 100 };
		assert.equal(f.api.settleAdult(0).ok, true);
		let resolve;
		f.c.EdenLifeStoryPrompt = { buildMessages: () => [] };
		f.c.EdenLLM = { chat: () => new Promise(done => { resolve = done; }) };
		const pending = f.c.EdenLifeStory.startGeneration(f.v.eden, f.c.EdenChildData.collection(), 0);
		await new Promise(setImmediate);
		assert.equal(typeof resolve, "function");
		assert.equal(f.api[action](0).ok, true);
		const response = Object.fromEntries(["universityExperience", "economicSituation", "marriageSituation", "dailyLife", "attitudeToPc"].map(key => [key, "stale"]));
		assert.equal(f.c.EdenLifeStory.parseContent(JSON.stringify(response)).dailyLife, "stale");
		resolve({ text: JSON.stringify(response), model: "test" });
		await pending;
		assert.ok(!JSON.stringify(f.v).includes("stale"));
	}
});
test("pending chat backgrounds cannot refill cleared or deleted child data", async () => {
	for (const action of ["settleAdult", "removeChild", "reset"]) {
		const f = fixture(); assert.equal(f.api.settleAdult(0).ok, true);
		f.v.eden.selectedChildId = "0"; f.c.SugarCube.State.passage = "Eden Chat";
		let resolve;
		f.c.EdenChatPrompt = { foundation: () => [] };
		f.c.EdenLLM = { getChatSettings: async () => ({}), isConfigured: () => true, chat: () => new Promise(done => { resolve = done; }) };
		const session = f.c.EdenChat.open(0);
		await new Promise(setImmediate); assert.equal(typeof resolve, "function");
		assert.equal(f.api[action](0).ok, true);
		resolve({ text: JSON.stringify({ background: "stale background" }) });
		await session.done;
		assert.equal(session.valid(), false); assert.ok(!JSON.stringify(f.v).includes("stale background"));
	}
});
test("fertilisation and maturity are separate across both orifices, preserving growth and value", () => {
	const f = fixture();
	for (const part of ["vagina", "anus"]) f.v.sexStats[part] = { pregnancy: { type: "parasite", motherStatus: 1, fetus: [
		{ fertilised: false, daysLeft: 1, timeLeft: null, stats: { growth: 14, gender: "Hermaphrodite", lastEgg: 4 } },
		{ fertilised: true, daysLeft: 8, stats: { growth: 9, gender: "Female" } },
	] } };
	assert.equal(f.api.parasites(false).ok, true);
	for (const part of ["vagina", "anus"]) {
		const p = f.v.sexStats[part].pregnancy;
		assert.equal(p.fetus[0].fertilised, false); assert.equal(p.fetus[0].daysLeft, 1); assert.equal(p.fetus[1].daysLeft, 0);
	}
	assert.equal(f.api.parasites(true).ok, true);
	for (const part of ["vagina", "anus"]) {
		const p = f.v.sexStats[part].pregnancy;
		assert.equal(p.fetus[0].daysLeft, 14); assert.equal(p.motherStatus, 2);
	}
	assert.equal(f.api.parasites(false).ok, true);
	assert.equal(f.v.sexStats.vagina.pregnancy.fetus[0].stats.growth, 14);
	assert.equal(f.v.sexStats.vagina.pregnancy.fetus[0].stats.lastEgg, 4);
	assert.equal(f.api.parasites(false).ok, false);
});
test("invalid parasite data rolls back earlier entries and preserves object references", () => {
	const f = fixture();
	const egg = { fertilised: false, daysLeft: 1, stats: { growth: 10 } };
	f.v.sexStats.anus = { pregnancy: { type: "parasite", fetus: [egg, { fertilised: false }] } };
	const before = JSON.stringify(f.v);
	assert.equal(f.api.parasites(true).ok, false);
	assert.equal(f.v.sexStats.anus.pregnancy.fetus[0], egg);
	assert.equal(JSON.stringify(f.v), before);
});
test("identity changes persist through setup without altering the pregnancy or siblings", () => {
	const f = fixture();
	const pregnancy = JSON.stringify(f.v.pregnancies);
	const sibling = structuredClone(f.child); sibling.childId = 1; f.v.childRecords.push(sibling);
	f.c.EdenChildData.syncRegistry(f.v.eden); f.c.EdenTraits.syncAll(f.v.eden, f.c.EdenChildData.collection());
	const other = JSON.stringify(sibling);
	assert.equal(f.api.saveInnate(0, { ...f.patch(), species: "wolf", monster: "monster", beastTransform: "", gender: "h", hairColour: "black", temperament: 90, intelligence: 99 }).ok, true);
	f.c.EdenAge.syncAll(f.v.eden, f.c.EdenChildData.collection()); f.c.EdenTraits.syncAll(f.v.eden, f.c.EdenChildData.collection());
	assert.equal(f.record.species, "wolf"); assert.equal(f.record.bodyForm, "humanoid"); assert.equal(f.child.gender, "h");
	assert.equal(f.record.innate.intelligence, 99); assert.equal(f.record.innate.personality, "active");
	assert.equal(JSON.stringify(f.v.pregnancies), pregnancy); assert.equal(JSON.stringify(sibling), other);
	assert.equal(f.api.saveInnate(0, { ...f.patch(), species: "human", monster: "", beastTransform: "" }).ok, true);
	assert.equal(f.record.species, "human");
	assert.equal(f.v.feats.locked, true);
});
test("invalid values and unsupported combinations are atomic", () => {
	for (const patch of [{ species: "dragon" }, { monster: "invalid" }, { intelligence: 101 }, { intelligence: "" }, { appearance: 1.2 }]) {
		const f = fixture(), before = JSON.stringify(f.v);
		assert.equal(f.api.saveInnate(0, { ...f.patch(), ...patch }).ok, false);
		assert.equal(JSON.stringify(f.v), before);
	}
});
test("validation and failed edits preserve getter-only aliases and shared references without throwing", () => {
	const f = fixture();
	let getterReads = 0;
	const getter = () => { getterReads++; return 1; };
	Object.defineProperty(f.v.player, "penis", { enumerable: true, get: getter });
	f.v.samePlayer = f.v.player;
	f.v.cycle = f.v;
	const adult = f.record.adult, training = f.record.training;
	for (const value of [101, -1, "", " ", "bad", Infinity, null]) {
		const result = f.api.saveSkills(0, { knowledge: value, fitness: 0, social: 0, awareness: 0 });
		assert.equal(result.ok, false); assert.equal(result.message, "请输入0-100之间的数字");
	}
	f.c.EdenAdult = { syncRecord() { throw new Error("failed refresh"); } };
	const result = f.api.saveInnate(0, { ...f.patch(), gender: "m", intelligence: 100 });
	assert.equal(result.message, "failed refresh");
	assert.equal(f.child.gender, "f"); assert.equal(f.v.samePlayer, f.v.player); assert.equal(f.v.cycle, f.v);
	assert.equal(f.record.training, training); assert.equal(f.record.adult, adult);
	assert.equal(Object.getOwnPropertyDescriptor(f.v.player, "penis").get, getter);
	assert.equal(getterReads, 0);
});
test("humanoid animal traits save correctly; human base ignores the redundant flag and zero is valid", () => {
	for (const species of ["wolf", "hawk"]) {
		const f = fixture();
		assert.equal(f.api.saveInnate(0, { ...f.patch(), species, monster: "", beastTransform: "" }).ok, true);
		assert.equal(f.record.bodyForm, "beast");
		assert.equal(f.api.saveInnate(0, { ...f.patch(), monster: "monster" }).ok, true);
		assert.equal(f.record.bodyForm, "humanoid");
	}
	const f = fixture();
	assert.equal(f.api.saveInnate(0, { ...f.patch(), monster: "monster", intelligence: 0 }).ok, true);
	assert.equal(f.child.features.monster, null); assert.equal(f.record.bodyForm, "humanoid");
	f.c.EdenTraits.syncRecord(f.record, f.child, "0", f.v);
	assert.equal(f.record.innate.intelligence, 0);
});
test("adult reset clears current pregnancies and cached adult state, while keeping born descendants", { skip: !source }, () => {
	const f = fixture(); assert.equal(f.api.settleAdult(0).ok, true);
	f.v.eden.facility = { owned: true, capacity: 3 };
	f.record.adult.pregnancy = { pregnancyId: 1, edenParentChildId: "0" };
	f.record.adult.lifeStory = { content: { dailyLife: "old" } }; f.record.chat = { background: "old" };
	f.v.pregnancies.push({ pregnancyId: 1, carrier: "Eden child 0", donor: "pc", deliveredDate: null, conceivedDate: 100 });
	f.v.pregnancies.push({ pregnancyId: 2, carrier: "Eden child 0", donor: "pc", deliveredDate: 100, conceivedDate: 0 });
	f.v.childRecords.push({ ...structuredClone(f.child), childId: 1, pregnancyId: 1, bornDate: null });
	f.v.childRecords.push({ ...structuredClone(f.child), childId: 2, pregnancyId: 2 });
	f.v.storedNPCs = { oldSlot: { npc: { fullDescription: "Eden child 0" }, pregnancy: { fetus: [{ childId: "legacy" }] } }, keep: { npc: { fullDescription: "other" } } };
	f.v.per_npc = { "eden_child:0": { fullDescription: "Eden child 0" }, keep: { name: "other" } };
	const birth = f.child.bornDate, innate = JSON.stringify(f.record.innate), bornDescendant = JSON.stringify(f.v.childRecords[2]);
	assert.equal(f.api.resetReason(0), "");
	assert.equal(f.api.reset(0).ok, true);
	assert.equal(f.record.ageDays, 0); assert.equal(f.record.lifeStage, "infant"); assert.equal(f.record.forcedAdult, undefined);
	assert.equal(f.record.adult.settled, false); assert.equal(f.record.adult.pregnancy, undefined); assert.equal(f.record.chat, undefined);
	assert.equal(f.v.pregnancies[1].carrier, "cleared"); assert.equal(f.c.EdenChildData.get(1), undefined);
	assert.equal(f.v.pregnancies[2].carrier, "Eden child 0"); assert.equal(JSON.stringify(f.v.childRecords[2]), bornDescendant);
	assert.equal(f.v.storedNPCs.oldSlot, undefined); assert.ok(f.v.storedNPCs.keep);
	assert.equal(f.v.per_npc["eden_child:0"], undefined); assert.ok(f.v.per_npc.keep);
	assert.equal(f.child.development.location, "eden_home"); assert.equal(f.child.bornDate, birth);
	assert.equal(JSON.stringify(f.record.innate), innate);
	vm.runInContext(fs.readFileSync(path.join(modules, "eden-breeding.js"), "utf8"), f.c);
	f.c.EdenBreeding.syncAll(f.v.eden, f.c.EdenChildData.collection(), f.v);
	assert.ok(!f.record.adult.pregnancy);
	assert.equal(f.c.getActivePregnancies("Eden child 0").length, 0);
});
test("editing an identical sibling preserves the shared baseline and the other sibling's traits", () => {
	const f = fixture(); f.child.identical = 0;
	const sibling = structuredClone(f.child); sibling.childId = 1; f.v.childRecords.push(sibling);
	delete f.record.innate;
	f.c.EdenChildData.syncRegistry(f.v.eden); f.c.EdenTraits.syncAll(f.v.eden, f.c.EdenChildData.collection());
	const before = JSON.stringify(f.v.eden.children[1].innate), base = JSON.stringify(f.record.innate.base);
	assert.equal(f.api.saveInnate(0, { ...f.patch(), intelligence: 100, temperament: 1 }).ok, true);
	f.c.EdenTraits.syncAll(f.v.eden, f.c.EdenChildData.collection());
	assert.equal(JSON.stringify(f.v.eden.children[1].innate), before);
	assert.equal(JSON.stringify(f.record.innate.base), base);
	assert.equal(f.record.innate.intelligence, 100);
});
test("an exception during derived child synchronisation rolls back the complete edit", () => {
	const f = fixture(), before = JSON.stringify(f.v);
	f.c.EdenAdult = { syncRecord() { throw new Error("failed refresh"); } };
	assert.equal(f.api.saveInnate(0, { ...f.patch(), intelligence: 100, gender: "h" }).ok, false);
	assert.equal(JSON.stringify(f.v), before);
	assert.equal(f.v.childRecords[0], f.child); assert.equal(f.v.eden.children[0], f.record);
});
test("reset preserves birth, identity, affection and money, clears schedules and prevents catch-up", () => {
	const f = fixture(); f.record.affection = 83; f.record.training.skills.knowledge = 97;
	f.record.training.repeatSchedule = ["textbook", "textbook", "textbook"];
	f.record.training.plannedDay = 45; f.record.training.plannedSchedule = ["novel", "novel", "novel"];
	const child = JSON.stringify(f.child), innate = JSON.stringify(f.record.innate), money = f.v.money;
	assert.equal(f.api.reset(0).ok, true);
	assert.equal(f.record.ageDays, 0); assert.equal(f.record.lifeStage, "infant"); assert.equal(f.record.affection, 83);
	assert.equal(f.record.training.repeatSchedule.join(","), "rest,rest,rest"); assert.equal(f.record.training.plannedDay, null);
	f.c.EdenTraining.syncRecord(f.record, f.child, f.v.eden.settings);
	assert.equal(f.record.training.skills.knowledge, 0); assert.equal(f.v.money, money);
	assert.equal(JSON.stringify(f.child), child); assert.equal(JSON.stringify(f.record.innate), innate);
});
test("unborn and removed children cannot be reset", () => {
	for (const change of [f => { f.child.bornDate = null; f.v.pregnancies[0].deliveredDate = null; }, f => f.v.pregnancies[0].carrier = "cleared"]) {
		const f = fixture(); change(f); const before = JSON.stringify(f.v);
		assert.equal(f.api.reset(0).ok, false); assert.equal(JSON.stringify(f.v), before);
	}
});
test("adult reset rechecks nursery capacity including laid eggs, before clearing any data", () => {
	const f = fixture(); assert.equal(f.api.settleAdult(0).ok, true);
	f.record.chat = { background: "keep" }; f.record.adult.pregnancy = { pregnancyId: 9 };
	f.v.eden.facility.capacity = 2;
	assert.equal(f.api.resetReason(0), "");
	for (let id = 1; id <= 3; id++) f.v.childRecords.push({ ...structuredClone(f.child), childId: id,
		bornDate: id === 1 ? f.child.bornDate : null, species: id === 2 ? "hawk" : "human", development: { location: "eden_home" } });
	const before = JSON.stringify(f.v);
	assert.match(f.api.resetReason(0), /没有空位/);
	assert.match(f.api.reset(0).message, /没有空位/);
	assert.equal(JSON.stringify(f.v), before);
	f.v.childRecords[1].development.location = "home";
	assert.equal(f.api.resetReason(0), "");
	assert.equal(f.api.reset(0).ok, true);
	assert.equal(f.child.development.location, "eden_home");
	assert.equal(f.c.EdenFacility.residentIds(f.v).length, 2);
});
test("existing residents can reset without another bed; absent ownership blocks returning adults", () => {
	const f = fixture(); f.v.eden.facility.capacity = 1;
	assert.equal(f.api.reset(0).ok, true);
	assert.equal(f.api.settleAdult(0).ok, true);
	f.v.eden.facility.owned = false;
	const before = JSON.stringify(f.v);
	assert.match(f.api.resetReason(0), /尚未拥有伊甸园/);
	assert.equal(f.api.reset(0).ok, false); assert.equal(JSON.stringify(f.v), before);
});
test("skills accept two decimal places and do not reselect a settled career", () => {
	const f = fixture(); Object.assign(f.record.adult, { settled: true, career: "teacher", outcome: "work" });
	assert.equal(f.api.saveSkills(0, { knowledge: 45.67, fitness: 0, social: 100, awareness: 20 }).ok, true);
	assert.equal(f.record.training.skills.knowledge, 45.67); assert.equal(f.record.adult.career, "teacher");
	assert.equal(f.api.saveSkills(0, { knowledge: 101, fitness: 0, social: 0, awareness: 0 }).ok, false);
});
test("native labour honours variance and lay care, breaks waters only for live births", { skip: !source }, () => {
	const f = fixture();
	f.v.pregnancies.push({ pregnancyId: 1, carrier: "pc", donorSpecies: "human", conceivedDate: f.c.Time.date.timeStamp, deliveredDate: null, gestationVariance: 1.2, waterBreaking: false });
	f.v.pregnancies.push({ pregnancyId: 2, carrier: "pc", donorSpecies: "harpy", conceivedDate: f.c.Time.date.timeStamp, deliveredDate: null, gestationVariance: 1.1, layCare: 86400, waterBreaking: false });
	const result = f.api.labour();
	assert.equal(result.ok, true, result.message);
	for (const p of f.v.pregnancies.slice(1)) assert.equal(f.c.getDueDate(p), f.c.Time.date.timeStamp);
	assert.equal(f.v.pregnancies[1].waterBreaking, true); assert.equal(f.v.pregnancies[2].waterBreaking, false); assert.equal(f.v.eventskip, 1);
	assert.equal(f.v.pregnancies[1].deliveredDate, null); assert.equal(f.v.childRecords.length, 1);
});

test("failed edits restore nested collections, dates, symbols and deep graphs without traversing getters", () => {
	const f = fixture(), symbol = Symbol("saved"), item = { score: 1 };
	f.v.extra = { map: new Map([["before", item]]), set: new Set([item]), date: new Date(1000), [symbol]: { score: 2 } };
	let tail = f.v.extra;
	for (let i = 0; i < 12000; i++) tail = tail.next = {};
	f.c.EdenAdult = { syncRecord() {
		f.v.extra.map.clear(); f.v.extra.map.set("after", {}); f.v.extra.set.clear(); f.v.extra.date.setTime(5000);
		item.score = 9; f.v.extra[symbol].score = 8; tail.added = true;
		throw null;
	} };
	const result = f.api.saveInnate(0, { ...f.patch(), intelligence: 100 });
	assert.equal(result.ok, false); assert.ok(result.message);
	assert.equal(f.v.extra.map.get("before"), item); assert.equal(f.v.extra.map.size, 1);
	assert.equal(f.v.extra.set.has(item), true); assert.equal(item.score, 1);
	assert.equal(f.v.extra.date.getTime(), 1000); assert.equal(f.v.extra[symbol].score, 2); assert.equal(tail.added, undefined);
});
test("non-Error throws are reported inline and a failed rollback does not throw again", () => {
	const f = fixture();
	f.c.EdenAdult = { syncRecord() { throw "模块错误"; } };
	assert.equal(f.api.saveInnate(0, f.patch()).message, "模块错误");
	f.c.EdenAdult = { syncRecord() { Object.defineProperty(f.child, "nonRemovable", { value: true }); throw new Error("failure"); } };
	assert.match(f.api.saveInnate(0, f.patch()).message, /部分数据无法还原/);
});
test("missing dates cannot corrupt conception timestamps", { skip: !source }, () => {
	const f = fixture();
	f.v.pregnancies.push({ pregnancyId: 1, carrier: "pc", donorSpecies: "human", conceivedDate: f.c.Time.date.timeStamp, deliveredDate: null });
	f.c.Time = { date: {} };
	const before = JSON.stringify(f.v);
	assert.match(f.api.labour().message, /无法读取当前日期/);
	assert.equal(JSON.stringify(f.v), before);
});
test("malformed parasites roll back earlier changes in the same batch", () => {
	for (const invalid of [null, 1, "egg", {}]) {
		const f = fixture();
		f.v.sexStats = { vagina: { pregnancy: { type: "parasite", fetus: [{ fertilised: false, stats: { growth: 4 } }, invalid] } } };
		const before = JSON.stringify(f.v);
		assert.equal(f.api.parasites(true).ok, false);
		assert.equal(JSON.stringify(f.v), before);
	}
});
test("missing records, invalid IDs and repeat deletion fail without changing the save", () => {
	const f = fixture();
	for (const id of [undefined, null, -1, 999, "missing"]) {
		const before = JSON.stringify(f.v);
		for (const action of [() => f.api.reset(id), () => f.api.settleAdult(id), () => f.api.removeChild(id), () => f.api.saveInnate(id, f.patch()), () => f.api.saveSkills(id, {})]) assert.equal(action().ok, false);
		assert.equal(JSON.stringify(f.v), before);
	}
	assert.equal(f.api.removeChild(0).ok, true);
	const before = JSON.stringify(f.v);
	assert.equal(f.api.removeChild(0).ok, false); assert.equal(JSON.stringify(f.v), before);
});

test("supported forms survive repeated edits, settlement, resets and deletion", () => {
	for (const species of ["human", "wolf", "hawk"]) for (const gender of ["m", "f", "h"]) for (const monster of ["", "monster"]) {
		const f = fixture();
		assert.equal(f.api.saveInnate(0, { ...f.patch(), species, gender, monster, beastTransform: "", intelligence: 100 }).ok, true);
		assert.equal(f.api.saveSkills(0, { knowledge: 100, fitness: 0, social: 50, awareness: 99.99 }).ok, true);
		for (let i = 0; i < 2; i++) {
			const result = f.api.settleAdult(0);
			assert.equal(result.ok, species === "human" || monster === "monster", `${species}/${gender}/${monster}: ${result.message}`);
			assert.equal(f.api.reset(0).ok, true);
			assert.equal(f.record.ageDays, 0);
		}
		assert.equal(f.api.removeChild(0).ok, true);
		assert.equal(f.api.children().length, 0);
	}
});
test("incomplete old-save fields either recover or return an atomic failure for each child action", () => {
	for (const missing of ["features", "development", "innate", "training", "adult", "facility", "settings"]) {
		for (const action of [f => f.api.saveInnate(0, f.patch()), f => f.api.saveSkills(0, { knowledge: 1, fitness: 2, social: 3, awareness: 4 }), f => f.api.reset(0), f => f.api.settleAdult(0), f => f.api.removeChild(0)]) {
			const f = fixture();
			delete (Object.hasOwn(f.child, missing) ? f.child : Object.hasOwn(f.record, missing) ? f.record : f.v.eden)[missing];
			const patch = { ...f.api.identity(f.child), appearance: 50, fitness: 50, intelligence: 50, temperament: 50 };
			f.patch = () => patch;
			const before = JSON.stringify(f.v), result = action(f);
			assert.equal(typeof result.ok, "boolean", missing);
			assert.equal(typeof result.message, "string", missing);
			if (!result.ok) assert.equal(JSON.stringify(f.v), before, missing);
		}
	}
});

test("ongoing birth and child events cannot lose the records their next scene still needs", () => {
	for (const passage of ["Children Activity Events", "childCuddle", "Wolf Cave Hurt Pup", "Eden Child Interaction Event", "Eden Adult Birth", "Eden Adult Settlement", "Eden Adult Release Confirm", null]) {
		const f = fixture(); f.c.SugarCube.State.passage = passage;
		if (passage === null) f.v.pregnancies[0].birthInProgress = true;
		const before = JSON.stringify(f.v);
		for (const action of [() => f.api.labour(), () => f.api.reset(0), () => f.api.removeChild(0), () => f.api.settleAdult(0), () => f.api.saveInnate(0, f.patch())]) {
			const result = action(); assert.equal(result.ok, false); assert.match(result.message, /事件|生产流程/);
		}
		assert.equal(JSON.stringify(f.v), before);
	}
});
