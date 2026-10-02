const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture({ hour = 9, age = 90, lastDay = 89, money = 100000, neverAutoAdult = false } = {}) {
	const settings = { maturityDays: 90, neverAutoAdult };
	const variables = { money, eden: { settings } };
	const window = { Time: { days: age, hour }, SugarCube: { State: { variables } } };
	const context = vm.createContext({ window });
	for (const module of ["eden-age", "eden-training", "eden-adult"]) {
		vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules", `${module}.js`), "utf8"), context);
	}
	const record = {
		childId: "test", species: "fox", bodyForm: "humanoid", ageDays: age,
		stageThresholds: window.EdenAge.getThresholds("fox", settings),
		lifeStage: age >= 90 && !neverAutoAdult ? "adult" : "adolescent",
		affection: 80,
		innate: { intelligence: 50, fitness: 50, appearance: 50, personality: "quiet" },
	};
	const child = { type: "human", location: "eden_home" };
	record.training = window.EdenTraining.normalizeTraining(null);
	record.training.lastProcessedDay = lastDay;
	record.training.repeatSchedule = ["privateTutor", "socialWork", "talk"];
	record.training.plannedDay = 90;
	record.training.plannedSchedule = [...record.training.repeatSchedule];
	return { window, record, child, settings, variables };
}

for (const hour of [1, 7, 8, 12]) {
	test(`final juvenile plan is completed before adult settlement at ${hour}:00, exactly once`, () => {
		const f = fixture({ hour });
		f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
		assert.equal(f.record.training.lastResult.stage, "adolescent");
		assert.equal(f.record.training.lastProcessedDay, 90);
		assert.equal(f.record.training.lastResult.spent, 10000);
		assert.ok(f.record.training.skills.knowledge > 0);
		assert.ok(f.record.training.skills.fitness > 0);
		const skills = JSON.stringify(f.record.training.skills);
		f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
		assert.equal(JSON.stringify(f.record.training.skills), skills);
		assert.equal(f.variables.money, 90000);
		f.record.training.skills.awareness = 80;
		const result = f.window.EdenAdult.settle(f.record, f.child);
		assert.equal(result.ok, true);
		assert.ok(f.record.adult.scores.university > 20);
	});
}

test("late catch-up includes the final plan but no adult growth or charges", () => {
	const f = fixture({ age: 94 });
	f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
	assert.equal(f.record.training.lastProcessedDay, 90);
	assert.equal(f.record.training.lastResult.day, 90);
	assert.equal(f.variables.money, 90000);
	const skills = JSON.stringify(f.record.training.skills);
	f.window.Time.days = 95;
	f.record.ageDays = 95;
	f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
	assert.equal(JSON.stringify(f.record.training.skills), skills);
	assert.equal(f.variables.money, 90000);
});

test("final-day paid activities still fail without money; free activities execute", () => {
	const f = fixture({ money: 0 });
	f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
	assert.equal(f.record.training.skills.knowledge, 0);
	assert.equal(f.record.training.lastResult.failedActivities.length, 1);
	assert.ok(f.record.training.skills.fitness > 0);
	assert.equal(f.variables.money, 0);
});

test("disabling automatic adulthood keeps the normal 08:00 settlement", () => {
	const f = fixture({ hour: 7, neverAutoAdult: true });
	f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
	assert.equal(f.record.training.lastProcessedDay, 89);
	assert.equal(f.record.training.skills.knowledge, 0);
	f.window.Time.hour = 8;
	f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
	assert.equal(f.record.training.lastProcessedDay, 90);
	f.window.Time.days = 91;
	f.record.ageDays = 91;
	f.window.EdenTraining.syncRecord(f.record, f.child, f.settings);
	assert.equal(f.record.training.lastProcessedDay, 91);
	assert.equal(f.variables.money, 80000);
});
