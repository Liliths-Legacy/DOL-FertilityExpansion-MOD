const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture() {
	const eden = { facility: { owned: true }, settings: { maturityDays: 90 }, children: {} };
	const variables = { eden, money: 5000000 };
	const window = { Time: { days: 20, hour: 9 }, SugarCube: { State: { variables } } };
	const ctx = vm.createContext({ window });
	for (const name of ["eden-age", "eden-adult", "eden-training", "eden-interactions", "eden-upgrades"]) {
		vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules", `${name}.js`), "utf8"), ctx);
	}
	const record = { childId: "one", species: "fox", lifeStage: "child", ageDays: 40,
		stageThresholds: window.EdenAge.getThresholds("fox", eden.settings), affection: 50,
		innate: { intelligence: 50, appearance: 50, fitness: 50, personality: "quiet" } };
	const child = { type: "human", location: "eden_home" };
	record.training = window.EdenTraining.normalizeTraining(null);
	eden.children.one = record;
	return { window, eden, variables, record, child, children: { one: child } };
}

test("purchases charge once, preserve old saves and reject insufficient funds", () => {
	const f = fixture();
	assert.equal(f.window.EdenUpgrades.buy(f.eden, f.children, "nursery").ok, true);
	assert.equal(f.variables.money, 3800000);
	assert.equal(f.window.EdenUpgrades.buy(f.eden, f.children, "nursery").ok, false);
	assert.equal(f.variables.money, 3800000);
	f.variables.money = 0;
	assert.equal(f.window.EdenUpgrades.buy(f.eden, f.children, "library").ok, false);
	assert.equal(f.eden.facility.upgrades.owned.library, undefined);
});

test("library boosts only books and only from its effective settlement day", () => {
	const f = fixture();
	f.window.EdenUpgrades.buy(f.eden, f.children, "library");
	assert.equal(f.window.EdenUpgrades.bookMultiplier("textbook", 20), 1);
	assert.equal(f.window.EdenUpgrades.bookMultiplier("textbook", 21), 1.25);
	assert.equal(f.window.EdenUpgrades.bookMultiplier("privateTutor", 21), 1);
	const boosted = f.window.EdenTraining.applyDay(f.record.training, f.record, 21, ["textbook", "rest", "rest"], f.eden.settings);
	const baseline = fixture();
	const plain = baseline.window.EdenTraining.applyDay(baseline.record.training, baseline.record, 21, ["textbook", "rest", "rest"], baseline.eden.settings);
	assert.ok(boosted.changes.knowledge > plain.changes.knowledge);
});

test("paintings require ownership and retain historical effects on switching and removal", () => {
	const f = fixture();
	assert.equal(f.window.EdenUpgrades.hang(f.eden, f.children, "landscape").ok, false);
	f.window.EdenUpgrades.buy(f.eden, f.children, "landscape");
	f.window.EdenUpgrades.buy(f.eden, f.children, "abstract");
	assert.equal(f.window.EdenUpgrades.hanging(f.eden), null);
	f.window.EdenUpgrades.hang(f.eden, f.children, "landscape");
	assert.equal(f.window.EdenUpgrades.awarenessChange(20), 0);
	assert.equal(f.window.EdenUpgrades.awarenessChange(21), -1);
	f.window.Time.days = 21;
	f.window.EdenUpgrades.hang(f.eden, f.children, "abstract");
	assert.equal(f.window.EdenUpgrades.awarenessChange(21), -1);
	assert.equal(f.window.EdenUpgrades.awarenessChange(22), 1);
	f.window.Time.days = 22;
	f.window.EdenUpgrades.hang(f.eden, f.children, null);
	assert.equal(f.window.EdenUpgrades.awarenessChange(22), 1);
	assert.equal(f.window.EdenUpgrades.awarenessChange(23), 0);
});

test("painting applies to infants, respects growth scale, and does not apply to adults", () => {
	const f = fixture();
	f.window.EdenUpgrades.buy(f.eden, f.children, "abstract");
	f.window.EdenUpgrades.hang(f.eden, f.children, "abstract");
	f.record.lifeStage = "infant";
	f.record.ageDays = 1;
	const result = f.window.EdenTraining.applyDay(f.record.training, f.record, 21, ["rest", "rest", "rest"], { maturityDays: 180 });
	assert.equal(result.changes.awareness, 0.5);
	f.record.lifeStage = "adult";
	f.record.ageDays = 95;
	const adult = f.window.EdenTraining.applyDay(f.record.training, f.record, 21, ["rest", "rest", "rest"], f.eden.settings);
	assert.equal(adult.changes.awareness, 0);
});

test("nursery increases only resident juvenile affection, not adult interactions", () => {
	const baseline = fixture();
	const plain = baseline.window.EdenInteractions.recordInteraction(baseline.eden, baseline.children, "one", "unknown");
	const f = fixture();
	f.window.EdenUpgrades.buy(f.eden, f.children, "nursery");
	const boosted = f.window.EdenInteractions.recordInteraction(f.eden, f.children, "one", "unknown");
	assert.ok(boosted.gain > plain.gain);
	f.record.lifeStage = "adult";
	assert.equal(f.window.EdenInteractions.recordInteraction(f.eden, f.children, "one", "unknown").gain, 0);
	assert.equal(f.window.EdenUpgrades.affectionMultiplier(f.eden, { location: "home" }), 1);
});
