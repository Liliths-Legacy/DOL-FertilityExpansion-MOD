const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const modules = path.join(__dirname, "../mods/FertilityExpansion/modules");
const json = value => JSON.parse(JSON.stringify(value));
function contact(id = "0", fields = {}) {
	return { childId: id, bodyForm: "humanoid", species: "fox", speciesLabel: "狐狸", profile: "保留简介", affection: 80,
		innate: { appearance: 82, fitness: 77, intelligence: 81, temperament: 30, personality: "quiet" },
		training: { skills: { knowledge: 85, fitness: 70, social: 75, awareness: 80 } },
		adult: { settled: true, settledDay: 90, destination: "away", outcome: "awayWork", education: "university",
			career: "doctor", contactStatus: "active", lastRemittanceMonth: 24312 }, ...fields };
}
function child(id = 0, fields = {}) {
	return { childId: id, pregnancyId: 0, species: "human", gender: "f", name: "青禾", bornDate: 100,
		features: { beastTransform: "fox" }, identical: null, development: { location: "eden_contacts", interactionsTotal: 25 }, ...fields };
}
function fixture({ legacy = false } = {}) {
	const id = legacy ? "pc|Robin|0" : "0";
	const record = contact(id);
	const original = legacy
		? { childId: id, name: "青禾", gender: "f", type: "human", mother: "pc", father: "Robin", motherKnown: true,
			born: { year: 2026, month: "May", day: 31 }, features: { beastTransform: "fox" }, location: "eden_contacts" }
		: child();
	const eden = { children: { [id]: record }, selectedChildId: legacy ? id : 0, settings: {} };
	const variables = { eden, options: { eden: {} }, pregnancies: [{ pregnancyId: 0, carrier: "pc", donor: "Robin", deliveredDate: 100,
		conceivedDate: 1, awareOfCarrier: ["pc"], awareOfDonor: [] }] };
	if (legacy) variables.children = { [id]: original }; else variables.childRecords = [original];
	const played = [];
	const calls = [];
	const window = { Time: { year: 2026, month: 6, monthDay: 1, days: 130 },
		SugarCube: { State: { variables, passage: "Eden Life Story Generate" }, Engine: { play(name) { played.push(name); } } },
		DateTime: class {
			constructor(timestamp) {
				const dates = { 0: { year: 1, month: 1, day: 1 }, 1: { year: 2026, month: 3, day: 1 }, 100: { year: 2026, month: 5, day: 31 } };
				if (!dates[timestamp]) throw new Error("Unknown fixture date");
				Object.assign(this, dates[timestamp]);
			}
		},
		EdenLLM: { async chat(messages, options) { calls.push({ messages, options }); return response(); } },
	};
	const context = vm.createContext({ window });
	for (const name of ["eden-child-data", "eden-age", "eden-adult", "eden-breeding", "eden-life-story-prompt", "eden-life-story"]) {
		vm.runInContext(fs.readFileSync(path.join(modules, `${name}.js`), "utf8"), context);
	}
	return { window, variables, eden, record, child: original, id, calls, played, context, data: window.EdenChildData, story: window.EdenLifeStory };
}
function response(text = "已生成的来信") {
	return { model: "test-model", text: JSON.stringify({ universityExperience: text, economicSituation: "经济情况", marriageSituation: "婚姻情况",
		dailyLife: "日常生活", attitudeToPc: "亲近家人", photoDescriptions: ["照片一", "照片二"] }) };
}
function deferred() {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
}

test("legacy letter arrival, text and snapshot survive schema upgrade and child ID changes", () => {
	const f = fixture({ legacy: true });
	const state = { dataVersion: 1, status: "waiting", dueDay: 120, content: { dailyLife: "历史来信" }, inputSnapshot: { childId: f.id } };
	f.record.adult.lifeStory = state;
	f.story.ensureState(f.record);
	assert.equal(state.dataVersion, 2);
	assert.equal(state.delayDays, 30);
	assert.equal(state.dueDay, 120);
	f.record.childId = "0";
	f.story.ensureState(f.record);
	assert.equal(state.dueDay, 120);
	assert.deepEqual(state.content, { dailyLife: "历史来信" });
	assert.equal(state.inputSnapshot.childId, f.id);
	assert.equal(state.status, "waiting");
});

test("new information dates, adoption zero and interaction counts come from native records", () => {
	const f = fixture();
	f.child.species = "hawk";
	f.child.identical = 0;
	f.child.development.adoptedDate = 0;
	assert.deepEqual(json(f.data.bornOf(f.child)), { year: 2026, month: "May", day: 31 });
	assert.deepEqual(json(f.data.laidOf(f.child)), { year: 2026, month: "May", day: 31 });
	assert.deepEqual(json(f.data.adoptedOf(f.child)), { year: 1, month: "January", day: 1 });
	assert.equal(f.data.isIdentical(f.child), true);
	assert.equal(f.data.developmentOf(f.child).interactionsTotal, 25);
	assert.equal(f.data.parentsOf(f.child).fatherKnown, false);
	f.child.bornDate = null;
	assert.equal(f.data.phaseOf(f.child), "egg");
	assert.equal(f.data.bornOf(f.child), null);
});

test("legacy information still reads dates and local rearing data without altering saved fields", () => {
	const f = fixture({ legacy: true });
	f.child.laid = { year: 2026, month: "May", day: 30 };
	f.child.adopted = { year: 2026, month: "May", day: 31 };
	f.child.localVariables = { interactionsTotal: 0 };
	const before = JSON.stringify(f.variables);
	assert.equal(f.data.laidOf(f.child).day, 30);
	assert.equal(f.data.adoptedOf(f.child).day, 31);
	assert.equal(f.data.developmentOf(f.child).interactionsTotal, 0);
	assert.equal(JSON.stringify(f.variables), before);
});

test("missing dates, development and pregnancy are safe to display", () => {
	const f = fixture();
	f.child.pregnancyId = 99;
	delete f.child.development;
	assert.equal(f.data.laidOf(f.child), null);
	assert.equal(f.data.adoptedOf(f.child), null);
	assert.deepEqual(json(f.data.developmentOf(f.child)), {});
	assert.deepEqual(json(f.data.parentsOf(f.child)), { mother: null, father: null, motherKnown: false, fatherKnown: false });
});

test("Eden parent zero displays its current name and never falls back to stale legacy data", () => {
	const f = fixture();
	assert.equal(f.window.EdenBreeding.parentDisplayName("Eden child 0"), "青禾");
	f.child.name = "改名后";
	assert.equal(f.window.EdenBreeding.parentDisplayName("Eden child 0"), "改名后");
	assert.equal(f.window.EdenBreeding.parentDisplayName("Robin"), null);
	f.variables.childRecords = [];
	f.variables.children = { 0: { name: "旧资料中的名字" } };
	assert.equal(f.window.EdenBreeding.parentDisplayName("Eden child 0"), "未命名的孩子");
});

test("contact sorting keeps child zero, lost contacts and missing native records while excluding released endings", () => {
	const f = fixture();
	for (let i = 1; i < 8; i++) f.eden.children[i] = contact(String(i), { adult: { ...f.record.adult, settledDay: 90 + i } });
	f.eden.children[1].adult.contactStatus = "lost";
	f.eden.children[1].adult.outcome = "lost";
	f.eden.children[2].adult.outcome = "released";
	const view = f.window.EdenAdult.ensureContactView(f.eden);
	view.timeOrder = "oldest";
	const ids = [...f.window.EdenAdult.getSortedContactIds(f.eden)];
	assert.deepEqual(ids, ["0", "1", "3", "4", "5", "6", "7"]);
	assert.equal(ids.slice(f.window.EdenAdult.contactPageSize).length, 1);
	assert.equal(f.data.get("7"), undefined);
	assert.equal(f.eden.children[7].profile, "保留简介");
});

test("remittance is still claimed once for native child zero", () => {
	const f = fixture();
	const first = f.window.EdenAdult.claimRemittance(f.record);
	assert.ok(first.pennies > 0);
	assert.equal(f.window.EdenAdult.claimRemittance(f.record).pennies, 0);
});

test("letter delay uses the same identity for numeric zero and string zero", () => {
	const f = fixture();
	assert.equal(f.story.delayFor(contact(0)), f.story.delayFor(contact("0")));
	assert.ok(f.story.delayFor(contact(0)) >= 10);
	assert.ok(f.story.delayFor(contact(0)) <= 30);
});

test("letter snapshots identify the native carrier, donor and adoptive parent correctly", () => {
	const f = fixture();
	assert.equal(f.story.buildSnapshot(f.record, f.child).pcParentRole, "mother");
	f.variables.pregnancies[0].carrier = "Robin";
	f.variables.pregnancies[0].donor = "pc";
	assert.equal(f.story.buildSnapshot(f.record, f.child).pcRelationship, "你是青禾的爸爸");
	f.variables.pregnancies[0].donor = "unknown";
	f.child.development.adoptedDate = 0;
	assert.equal(f.story.buildSnapshot(f.record, f.child).pcRelationship, "你是青禾的养父母");
	delete f.child.development.adoptedDate;
	assert.equal(f.story.buildSnapshot(f.record, f.child).pcRelationship, "你是青禾的家长");
	const old = fixture({ legacy: true });
	assert.equal(old.story.buildSnapshot(old.record, old.child).pcRelationship, "你是生下青禾的妈妈");
});

test("prompt normalization accepts new parent roles and legacy snapshots without mutating them", () => {
	const f = fixture();
	for (const [snapshot, relation] of [
		[{ name: "历史名字", pcRelationship: "你是生下历史名字的妈妈", affectionToPc: 77 }, "你是生下历史名字的妈妈"],
		[{ name: "青禾", pcParentRole: "adoptive" }, "你是青禾的养父母"],
		[{ name: "青禾", pcParentRole: "unknown" }, "你是青禾的家长"],
	]) {
		const before = JSON.stringify(snapshot);
		assert.equal(f.window.EdenLifeStoryPrompt.promptSnapshot(snapshot).pcRelationship, relation);
		assert.equal(JSON.stringify(snapshot), before);
	}
});

test("existing read letters, snapshots, dates and model metadata survive sync and reopening without another request", async () => {
	const f = fixture();
	const state = f.story.ensureState(f.record);
	Object.assign(state, { status: "read", content: json(JSON.parse(response("历史正文").text)), inputSnapshot: { name: "旧名字", profile: "历史简介", pcRelationship: "你是生下旧名字的妈妈" },
		readDay: 120, generatedDay: 119, providerModel: "old-model" });
	const before = JSON.stringify(state);
	f.child.name = "现在的名字"; f.record.profile = "新简介";
	f.story.syncAll(f.eden);
	await f.story.startGeneration(f.eden, f.data.collection(), 0);
	f.story.markRead(f.record);
	assert.equal(JSON.stringify(state), before);
	assert.equal(f.calls.length, 0);
});

test("numeric zero generates one letter when opened twice and redirects only its selected page", async () => {
	const f = fixture();
	const first = f.story.startGeneration(f.eden, f.data.collection(), 0);
	const second = f.story.startGeneration(f.eden, f.data.collection(), "0");
	await Promise.all([first, second]);
	assert.equal(f.calls.length, 1);
	assert.equal(f.record.adult.lifeStory.status, "ready");
	assert.equal(f.record.adult.lifeStory.inputSnapshot.pcParentRole, "mother");
	assert.equal(f.record.adult.lifeStory.providerModel, "test-model");
	assert.deepEqual(f.played, ["Eden Life Story Read"]);
});

test("legacy composite identities still generate and read letters using the same API", async () => {
	const f = fixture({ legacy: true });
	await f.story.startGeneration(f.eden, f.data.collection(), f.id);
	assert.equal(f.calls.length, 1);
	assert.equal(f.record.adult.lifeStory.inputSnapshot.pcParentRole, "mother");
	assert.equal(f.story.markRead(f.record), true);
	assert.equal(f.record.adult.lifeStory.status, "read");
});

test("interrupted legacy and new generation states become retryable errors", () => {
	for (const token of [undefined, "saved-request-token"]) {
		const f = fixture();
		const state = f.story.ensureState(f.record);
		Object.assign(state, { status: "generating", generationToken: token });
		assert.equal(f.story.ensureState(f.record).status, "error");
		assert.equal(f.story.resetForRetry(f.record), true);
	}
});

test("failed generation keeps its historical snapshot for retry after profile changes", async () => {
	const f = fixture();
	let attempts = 0;
	f.window.EdenLLM.chat = async () => { if (++attempts === 1) throw new Error("Temporary failure"); return response(); };
	await f.story.startGeneration(f.eden, f.data.collection(), 0);
	const state = f.record.adult.lifeStory;
	const snapshot = JSON.stringify(state.inputSnapshot);
	assert.equal(state.status, "error");
	f.record.profile = "修改过的简介";
	f.child.name = "修改过的名字";
	assert.equal(f.story.resetForRetry(f.record), true);
	await f.story.startGeneration(f.eden, f.data.collection(), 0);
	assert.equal(state.status, "ready");
	assert.equal(JSON.stringify(state.inputSnapshot), snapshot);
	assert.equal(attempts, 2);
});

test("a late response does not redirect a different child's generation page", async () => {
	const f = fixture();
	const pending = deferred();
	f.window.EdenLLM.chat = () => pending.promise;
	const task = f.story.startGeneration(f.eden, f.data.collection(), 0);
	await Promise.resolve();
	f.eden.selectedChildId = 1;
	pending.resolve(response());
	await task;
	assert.equal(f.record.adult.lifeStory.status, "ready");
	assert.deepEqual(f.played, []);
});

test("load to another save with the same child ID discards the old response", async () => {
	const f = fixture();
	const pending = deferred();
	f.window.EdenLLM.chat = () => pending.promise;
	const task = f.story.startGeneration(f.eden, f.data.collection(), 0);
	await Promise.resolve();
	const replacement = contact("0", { profile: "另一个存档" });
	f.window.SugarCube.State.variables = { eden: { children: { 0: replacement }, selectedChildId: 0 } };
	const before = JSON.stringify(replacement);
	pending.resolve(response());
	assert.equal(await task, null);
	assert.equal(JSON.stringify(replacement), before);
	assert.deepEqual(f.played, []);
});

test("normal passage state cloning retains the request token and receives the result in the live state", async () => {
	const f = fixture();
	const pending = deferred();
	f.window.EdenLLM.chat = () => pending.promise;
	const task = f.story.startGeneration(f.eden, f.data.collection(), 0);
	await Promise.resolve();
	const live = structuredClone(f.variables);
	f.window.SugarCube.State.variables = live;
	pending.resolve(response());
	await task;
	assert.equal(live.eden.children[0].adult.lifeStory.status, "ready");
	assert.equal(f.record.adult.lifeStory.content, null);
	assert.deepEqual(f.played, ["Eden Life Story Read"]);
});

test("a superseded request cannot remove the newer request or overwrite its letter", async () => {
	const f = fixture();
	const firstResult = deferred(); const secondResult = deferred();
	let count = 0;
	f.window.EdenLLM.chat = () => ++count === 1 ? firstResult.promise : secondResult.promise;
	const first = f.story.startGeneration(f.eden, f.data.collection(), 0);
	await Promise.resolve();
	const replacement = contact("0");
	const live = { ...f.variables, eden: { ...f.eden, children: { 0: replacement } } };
	f.window.SugarCube.State.variables = live;
	const second = f.story.startGeneration(live.eden, f.data.collection(), 0);
	await Promise.resolve();
	firstResult.resolve(response("旧请求"));
	await first;
	const duplicate = f.story.startGeneration(live.eden, f.data.collection(), 0);
	secondResult.resolve(response("新请求"));
	await Promise.all([second, duplicate]);
	assert.equal(count, 2);
	assert.equal(replacement.adult.lifeStory.content.universityExperience, "新请求");
});

test("synchronous prompt errors also release the request so retry can run", async () => {
	const f = fixture();
	const prompt = f.window.EdenLifeStoryPrompt;
	f.window.EdenLifeStoryPrompt = { buildMessages() { throw new Error("Invalid prompt"); } };
	await f.story.startGeneration(f.eden, f.data.collection(), 0);
	assert.equal(f.record.adult.lifeStory.status, "error");
	f.story.resetForRetry(f.record);
	f.window.EdenLifeStoryPrompt = prompt;
	await f.story.startGeneration(f.eden, f.data.collection(), 0);
	assert.equal(f.record.adult.lifeStory.status, "ready");
	assert.equal(f.calls.length, 1);
});
