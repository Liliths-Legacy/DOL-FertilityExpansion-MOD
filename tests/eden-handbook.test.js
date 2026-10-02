const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture() {
	const ctx = vm.createContext({ window: { Time: { days: 90 } } });
	for (const name of ["eden-age", "eden-adult", "eden-handbook"]) {
		vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules", `${name}.js`), "utf8"), ctx);
	}
	return { window: ctx.window, eden: { children: {} } };
}

test("only completed career settlements unlock; old saves are registered automatically", () => {
	const f = fixture();
	f.eden.children = {
		pending: { adult: { settled: false, outcome: "work", career: "teacher" } },
		lost: { adult: { settled: true, outcome: "lost", career: "clerk" } },
		released: { adult: { settled: true, outcome: "released", career: "worker" } },
		existing: { adult: { settled: true, outcome: "awayWork", career: "doctor" } },
	};
	assert.equal(f.window.EdenHandbook.entries(f.eden, "town").length, 0);
	assert.equal(f.window.EdenHandbook.entries(f.eden, "away")[0].id, "doctor");
	delete f.eden.children.existing;
	assert.equal(f.window.EdenHandbook.entries(f.eden, "away")[0].id, "doctor");
});

test("entries follow configured priority regardless of unlock order; categories are separate", () => {
	const f = fixture();
	for (const career of ["survival", "worker", "criminal", "teacher", "sexWorker", "clerk"]) {
		f.eden.children[career] = { adult: { settled: true, outcome: "work", career } };
	}
	for (const career of ["corporateEmployee", "actor", "doctor", "merchant", "athlete", "legislator", "professor"]) {
		f.eden.children[career] = { adult: { settled: true, outcome: "awayWork", career } };
	}
	assert.equal(f.window.EdenHandbook.entries(f.eden, "town").map(e => e.id).join(","), "teacher,clerk,worker,criminal,sexWorker,survival");
	assert.equal(f.window.EdenHandbook.entries(f.eden, "away").map(e => e.id).join(","), "doctor,professor,legislator,athlete,actor,merchant,corporateEmployee");
});

test("requirements expose live config with basic score first and extra gates after it", () => {
	const f = fixture();
	assert.equal(f.window.EdenHandbook.requirement("teacher", "town"), "学识×0.55 + 社交×0.25 + 意识×0.20 ≥ 70 且 学识 ≥ 65");
	assert.match(f.window.EdenHandbook.requirement("criminal", "town"), /\(100−意识\)×0.35 ≥ 60/);
	assert.match(f.window.EdenHandbook.requirement("doctor", "away"), /≥ 80 且 学识 ≥ 82 且 意识 ≥ 75 且 天生智力 ≥ 70$/);
	assert.equal(f.window.EdenHandbook.universityRequirement(), "学识×0.60 + 意识×0.25 + 社交×0.15 ≥ 65 且 意识 ≥ 60");
});

test("successful adult settlement unlocks the selected career on the next setup sync", () => {
	const f = fixture();
	const record = { species: "fox", lifeStage: "adult", affection: 80,
		training: { skills: { knowledge: 90, fitness: 90, social: 90, awareness: 90 } },
		innate: { appearance: 90, intelligence: 90, fitness: 90, temperament: 50 } };
	f.eden.children.one = record;
	const result = f.window.EdenAdult.settle(record, { type: "human", location: "eden_home" });
	assert.equal(result.ok, true);
	const entries = f.window.EdenHandbook.entries(f.eden, "away");
	assert.equal(entries.length, 1);
	assert.equal(entries[0].id, result.career);
});
