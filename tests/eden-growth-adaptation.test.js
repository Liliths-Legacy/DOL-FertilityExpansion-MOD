const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const modules = path.join(__dirname, "../mods/FertilityExpansion/modules");
const runtimePath = process.env.DOL_0512_HTML || path.resolve(__dirname, "../../DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html");
function nativeDates() {
	if (!fs.existsSync(runtimePath)) return null;
	const source = fs.readFileSync(runtimePath, "utf8").match(/<script[^>]*id="twine-user-script"[^>]*>([\s\S]*?)<\/script>/)[1];
	const headers = [...source.matchAll(/\/\* twine-user-script #\d+: "([^"]+)" \*\//g)];
	return ["00-time-constants.js", "datetime.js"].map(name => {
		const i = headers.findIndex(h => h[1].endsWith("\\" + name));
		assert.ok(i >= 0);
		return source.slice(headers[i].index + headers[i][0].length, headers[i + 1]?.index ?? source.length);
	}).join("\n");
}
const native = nativeDates();
const actualRuntime = { skip: native ? false : "Set DOL_0512_HTML for native DateTime tests" };

function fixture({ records = true, age = 40, hour = 9, location = "tower", reset = false, neverAutoAdult = false, useNative = false } = {}) {
	const settings = { maturityDays: 90, allowHumanDescendants: true, resetAgeOnTransfer: reset, neverAutoAdult };
	const eden = { settings, facility: { owned: true, capacity: 3, transferIntroduced: {} }, children: {} };
	const variables = { eden, options: { eden: { ...settings } }, money: 12000000 };
	const played = [];
	const document = { getElementById() { return null; } };
	const window = { Time: {}, SugarCube: { State: { variables, passage: "Bird Tower", temporary: {} }, Engine: { play(name) { played.push(name); } } } };
	// Portable fixture timestamps. Native integration tests replace this with the shipped class.
	window.DateTime = class {
		constructor(year, month, day) {
			const date = arguments.length === 1 ? new Date(year * 1000) : new Date(Date.UTC(year, month - 1, day));
			this.timeStamp = date.getTime() / 1000;
			this.year = date.getUTCFullYear(); this.month = date.getUTCMonth() + 1; this.day = date.getUTCDate();
		}
	};
	const context = vm.createContext({ window, document, $: () => ({ on() {} }) });
	if (useNative) vm.runInContext(native, context);
	for (const name of ["eden-age", "eden-child-data", "eden-training", "eden-adult", "eden-facility", "eden-upgrades", "eden-profile"]) {
		vm.runInContext(fs.readFileSync(path.join(modules, `${name}.js`), "utf8"), context);
	}
	const id = records ? "0" : "legacy|pc|0";
	const bornDate = new window.DateTime(2026, 1, 1).timeStamp;
	const child = records
		? { childId: 0, pregnancyId: 0, species: "human", gender: "f", bornDate, identical: null,
			features: { beastTransform: "fox" }, development: { location, interactionsTotal: 25, activity: "sleeping" } }
		: { childId: id, type: "human", gender: "f", mother: "pc", father: "Robin", born: { year: 2026, month: "January", day: 1 },
			features: { beastTransform: "fox" }, location, localVariables: { interactionsTotal: 25 } };
	if (records) {
		variables.childRecords = [child];
		variables.pregnancies = [{ pregnancyId: 0, carrier: "pc", donor: "Robin", conceivedDate: bornDate - 86400, deliveredDate: bornDate }];
	} else variables.children = { [id]: child };
	const data = window.EdenChildData;
	function advance(days, nextHour = 9) {
		const date = new Date(Date.UTC(2026, 0, 1) + days * 86400000);
		Object.assign(window.Time, { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, monthDay: date.getUTCDate(), days, hour: nextHour });
	}
	advance(age, hour);
	data.syncRegistry(eden);
	const record = eden.children[id];
	record.innate = { appearance: 50, fitness: 50, intelligence: 50, temperament: 50, personality: "quiet" };
	record.affection = 80;
	window.EdenAge.syncRecord(record, child, settings);
	record.training = window.EdenTraining.normalizeTraining(null);
	function sync() {
		const children = data.collection();
		window.EdenAge.syncAll(eden, children);
		window.EdenTraining.syncAll(eden, children);
		window.EdenAdult.syncAll(eden, children);
	}
	function addChild({ phase = "born", location = "eden_home", monster = "monster", adopted = false, own = true } = {}) {
		if (!records) throw new Error("Extra-child helper requires records");
		const childId = variables.childRecords.length;
		const pregnancyId = variables.pregnancies.length;
		variables.pregnancies.push({ pregnancyId, carrier: own ? "pc" : "unknown", donor: "Robin", deliveredDate: phase === "unborn" ? null : bornDate });
		const next = { childId, pregnancyId, species: "hawk", gender: "f", features: { monster }, bornDate: phase === "born" ? bornDate : null,
			development: { location, ...(adopted ? { adoptedDate: bornDate } : {}) } };
		variables.childRecords.push(next);
		data.syncRegistry(eden);
		return next;
	}
	return { window, variables, eden, settings, child, record, id, data, advance, sync, addChild, played };
}

for (const records of [false, true]) {
	const label = records ? "0.5.12" : "0.5.11";
	test(`${label}: transfer writes native location once and retains dates, traits and skills`, () => {
		const f = fixture({ records });
		const beforeBorn = JSON.stringify(records ? f.child.bornDate : f.child.born);
		f.record.training.skills.knowledge = 25;
		f.record.profile = "保留简介";
		const result = f.window.EdenFacility.move(f.eden, records ? 0 : f.id, "tower");
		assert.equal(result.ok, true);
		assert.equal(f.data.locationOf(f.child), "eden_home");
		assert.equal(f.record.ageDays, 40);
		assert.equal(JSON.stringify(records ? f.child.bornDate : f.child.born), beforeBorn);
		assert.equal(f.record.training.skills.knowledge, 25);
		assert.equal(f.record.profile, "保留简介");
		assert.equal(f.record.affection, 80);
		if (records) {
			assert.equal(f.child.development.interactionsTotal, 25);
			assert.equal(Object.hasOwn(f.child, "location"), false);
		}
		assert.equal(f.window.EdenFacility.move(f.eden, f.id, "tower").ok, false);
	});

	test(`${label}: Bailey transfer charges exactly once and uses the money accounting API`, () => {
		const f = fixture({ records, location: "home" });
		const charges = [];
		f.window.statChange = { money(delta, reason) { charges.push({ delta, reason }); f.variables.money += delta; } };
		assert.equal(f.window.EdenFacility.move(f.eden, f.id, "home").ok, true);
		assert.equal(f.variables.money, 2000000);
		assert.deepEqual(charges, [{ delta: -10000000, reason: "edenChildTransfer" }]);
		assert.equal(f.record.transferPaid, true);
		assert.equal(f.window.EdenFacility.move(f.eden, f.id, "home").ok, false);
		assert.equal(charges.length, 1);
	});

	test(`${label}: transfer reset starts mod age at zero and discards pre-transfer catch-up charges`, () => {
		const f = fixture({ records, age: 70, reset: true });
		f.record.training.lastProcessedDay = 5;
		f.record.training.repeatSchedule = ["privateTutor", "outdoorSports", "talk"];
		const born = JSON.stringify(records ? f.child.bornDate : f.child.born);
		assert.equal(f.window.EdenFacility.move(f.eden, f.id, "tower").ok, true);
		f.sync();
		assert.equal(f.record.ageDays, 0);
		assert.equal(f.record.lifeStage, "infant");
		assert.equal(f.record.training.lastProcessedDay, 70);
		assert.equal(f.record.training.skills.knowledge, 0);
		assert.equal(f.variables.money, 12000000);
		f.advance(71);
		f.sync();
		assert.equal(f.record.ageDays, 1);
		assert.equal(JSON.stringify(records ? f.child.bornDate : f.child.born), born);
	});
}

test("native capacity includes laid eggs but excludes unborn and removed pregnancies", () => {
	const f = fixture();
	f.addChild();
	f.addChild({ phase: "egg" });
	const unborn = f.addChild({ phase: "unborn" });
	const removed = f.addChild({ phase: "unborn" });
	f.variables.pregnancies[removed.pregnancyId].carrier = "cleared";
	assert.deepEqual([...f.window.EdenFacility.residentIds()], ["1", "2"]);
	assert.equal(f.window.EdenFacility.move(f.eden, 0, "tower").ok, true);
	assert.equal(f.window.EdenFacility.residentIds().length, 3);
	assert.equal(f.data.phaseOf(unborn), "unborn");
});

test("full capacity, insufficient money, moved child and incomplete migration fail without mutations", () => {
	for (const code of ["capacity", "money", "location", "migration"]) {
		const f = fixture({ location: "home" });
		assert.equal(f.window.EdenFacility.inspectTransfer(f.eden, 0, "home").ok, true);
		if (code === "capacity") for (let i = 0; i < 3; i++) f.addChild();
		if (code === "money") f.variables.money = 9999999;
		if (code === "location") f.child.development.location = "alex_cottage";
		if (code === "migration") f.window.EdenSaveMigration = { ensureReady: () => false };
		const before = JSON.stringify(f.variables);
		assert.equal(f.window.EdenFacility.move(f.eden, 0, "home").code, code);
		assert.equal(JSON.stringify(f.variables), before);
	}
});

test("eggs, unborn children, animal forms and unrelated children cannot transfer; adopted humanoid hawks can", () => {
	const f = fixture();
	for (const options of [{ phase: "egg" }, { phase: "unborn" }, { monster: "normal" }, { own: false }]) {
		const child = f.addChild({ location: "tower", ...options });
		f.eden.children[child.childId] ??= { childId: String(child.childId) };
		assert.equal(f.window.EdenFacility.inspectTransfer(f.eden, child.childId, "tower").eligible, false);
	}
	const adopted = f.addChild({ location: "tower", own: false, adopted: true });
	assert.equal(f.window.EdenFacility.move(f.eden, adopted.childId, "tower").ok, true);
	assert.equal(f.data.locationOf(adopted), "eden_home");
});

test("nonresident intervals do not accrue training and the first resident plan is charged once", () => {
	const f = fixture({ age: 70 });
	f.record.training.lastProcessedDay = 5;
	f.record.training.repeatSchedule = ["privateTutor", "outdoorSports", "talk"];
	f.sync();
	assert.equal(f.variables.money, 12000000);
	assert.equal(f.record.training.lastProcessedDay, 70);
	f.window.EdenFacility.move(f.eden, 0, "tower");
	f.advance(71, 7);
	f.sync();
	assert.equal(f.variables.money, 12000000);
	f.window.Time.hour = 8;
	f.sync();
	assert.equal(f.variables.money, 11990000);
	assert.ok(f.record.training.skills.knowledge > 0);
	const before = JSON.stringify(f.record.training);
	f.sync();
	assert.equal(JSON.stringify(f.record.training), before);
	assert.equal(f.variables.money, 11990000);
});

for (const hour of [1, 7, 8, 12]) {
	test(`native maturity at ${hour}:00 completes the final plan before settlement and frees capacity`, () => {
		const f = fixture({ age: 90, hour, location: "eden_home" });
		f.record.training.lastProcessedDay = 89;
		f.record.training.repeatSchedule = ["privateTutor", "socialWork", "talk"];
		f.sync();
		assert.equal(f.record.lifeStage, "adult");
		assert.equal(f.record.training.lastResult.stage, "adolescent");
		assert.equal(f.record.training.lastProcessedDay, 90);
		assert.equal(f.variables.money, 11990000);
		assert.equal(f.record.adult.pending, true);
		assert.equal(f.window.EdenAdult.needsSettlement(f.record, f.child), true);
		assert.equal(f.window.EdenAdult.settle(f.record, f.child).ok, true);
		assert.equal(f.data.locationOf(f.child), "eden_contacts");
		assert.equal(Object.hasOwn(f.child, "location"), false);
		assert.equal(f.window.EdenFacility.residentIds().length, 0);
		const before = JSON.stringify(f.record.training.skills);
		f.advance(95); f.sync();
		assert.equal(JSON.stringify(f.record.training.skills), before);
		assert.equal(f.variables.money, 11990000);
		assert.equal(f.window.EdenAdult.settle(f.record, f.child).ok, false);
	});
}

test("native late catch-up ends at the maturity day and never charges later adult days", () => {
	const f = fixture({ age: 95, location: "eden_home" });
	f.record.training.lastProcessedDay = 89;
	f.record.training.repeatSchedule = ["privateTutor", "rest", "rest"];
	f.sync();
	assert.equal(f.record.training.lastProcessedDay, 90);
	assert.equal(f.variables.money, 11990000);
	f.sync();
	assert.equal(f.variables.money, 11990000);
});

test("neverAutoAdult keeps native children on the normal 08:00 training schedule", () => {
	const f = fixture({ age: 90, hour: 7, location: "eden_home", neverAutoAdult: true });
	f.record.training.lastProcessedDay = 89;
	f.record.training.repeatSchedule = ["privateTutor", "rest", "rest"];
	f.sync();
	assert.equal(f.record.lifeStage, "adolescent");
	assert.equal(f.record.training.lastProcessedDay, 89);
	assert.equal(f.record.adult.pending, false);
	f.window.Time.hour = 8; f.sync();
	assert.equal(f.variables.money, 11990000);
	assert.equal(f.window.EdenAdult.settle(f.record, f.child).ok, false);
});

test("eggs do not train, charge fees or enter adult settlement even with stale mod stages", () => {
	const f = fixture({ location: "eden_home" });
	f.child.species = "hawk";
	f.child.features.monster = "monster";
	f.child.bornDate = null;
	f.record.lifeStage = "adult";
	f.record.training.lastProcessedDay = 1;
	assert.equal(f.window.EdenTraining.isEligible(f.record, f.child), false);
	assert.equal(f.window.EdenAdult.needsSettlement(f.record, f.child), false);
	assert.equal(f.window.EdenAdult.settle(f.record, f.child).ok, false);
	f.sync();
	assert.equal(f.record.ageDays, 0);
	assert.equal(f.record.adult.pending, false);
	assert.equal(f.variables.money, 12000000);
});

test("release settlement updates the native location and settled characters cannot re-enter the nursery", () => {
	const f = fixture({ age: 90, location: "eden_home" });
	f.sync();
	assert.equal(f.window.EdenAdult.settle(f.record, f.child, "release").ok, true);
	assert.equal(f.data.locationOf(f.child), "eden_released");
	f.child.development.location = "tower";
	assert.equal(f.window.EdenFacility.move(f.eden, 0, "tower").code, "settled");
});

test("native renovation and painting effects apply only after their purchase day", () => {
	const f = fixture({ location: "eden_home" });
	f.record.training.lastProcessedDay = 39;
	f.record.training.repeatSchedule = ["textbook", "rest", "rest"];
	assert.equal(f.window.EdenUpgrades.buy(f.eden, f.data.collection(), "library").ok, true);
	assert.equal(f.window.EdenUpgrades.bookMultiplier("textbook", 40), 1);
	assert.equal(f.window.EdenUpgrades.bookMultiplier("textbook", 41), 1.25);
	assert.equal(f.window.EdenUpgrades.buy(f.eden, f.data.collection(), "abstract").ok, true);
	f.window.EdenUpgrades.hang(f.eden, f.data.collection(), "abstract");
	assert.equal(f.window.EdenUpgrades.awarenessChange(40), 0);
	assert.equal(f.window.EdenUpgrades.awarenessChange(41), 1);
	f.window.EdenUpgrades.buy(f.eden, f.data.collection(), "nursery");
	assert.equal(f.window.EdenUpgrades.affectionMultiplier(f.eden, f.child), 1.25);
	f.child.development.location = "eden_contacts";
	assert.equal(f.window.EdenUpgrades.affectionMultiplier(f.eden, f.child), 1);
});

test("native child zero can open transfer, training and adult pages from the viewer buttons", () => {
	const f = fixture({ location: "home" });
	f.window.EdenProfileUi.openBaileyNegotiation(0);
	assert.equal(f.played.pop(), "Eden Bailey Negotiation");
	assert.equal(f.eden.selectedChildId, 0);
	f.child.development.location = "tower";
	f.window.EdenProfileUi.openChildTransfer(0);
	assert.equal(f.played.pop(), "Eden Child Transfer");
	f.window.EdenFacility.move(f.eden, 0, "tower");
	f.window.EdenProfileUi.openTraining(0);
	assert.equal(f.played.pop(), "Eden Training");
	f.advance(90); f.sync();
	f.window.EdenProfileUi.openAdultSettlement(0);
	assert.equal(f.played.pop(), "Eden Adult Settlement");
});

test("shipped DateTime drives growth, transfer reset and the final native training settlement", actualRuntime, () => {
	const f = fixture({ age: 70, reset: true, useNative: true });
	const born = f.child.bornDate;
	assert.equal(f.window.EdenFacility.move(f.eden, 0, "tower").ok, true);
	assert.equal(f.record.ageDays, 0);
	f.advance(159, 9); f.sync();
	assert.equal(f.record.lifeStage, "adolescent");
	f.window.EdenTraining.setPlan(f.record, f.child, ["privateTutor", "rest", "rest"]);
	f.advance(160, 1); f.sync();
	assert.equal(f.record.ageDays, 90);
	assert.equal(f.record.lifeStage, "adult");
	assert.equal(f.record.training.lastResult.stage, "adolescent");
	assert.equal(f.record.training.lastResult.spent, 10000);
	assert.equal(f.child.bornDate, born);
	assert.equal(f.window.EdenAdult.settle(f.record, f.child).ok, true);
});
