const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture() {
	const window = { Time: { days: 12 } };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-bed-visit.js"), "utf8"), { window });
	const record = {
		lifeStage: "adult",
		bodyForm: "humanoid",
		affection: 80,
		training: { skills: { awareness: 40 } },
		adult: { settled: true, destination: "town", contactStatus: "active" },
	};
	const eden = { children: { one: record } };
	const children = { one: { name: "一", gender: "m" } };
	return { window, api: window.EdenBedVisit, eden, children, record };
}

test("only eligible adult town contacts can visit", () => {
	const f = fixture();
	assert.equal(f.api.isEligible(f.record, f.children.one), true);
	for (const change of [
		{ affection: 79 },
		{ training: { skills: { awareness: 41 } } },
		{ lifeStage: "adolescent" },
		{ bodyForm: "beast" },
		{ adult: { settled: true, destination: "away", contactStatus: "active" } },
	]) {
		assert.equal(f.api.isEligible({ ...f.record, ...change }, f.children.one), false);
	}
});

test("selection observes a three-day cooldown and A/B is a 50 percent roll", () => {
	const f = fixture();
	const rolls = [0, 0.49];
	const first = f.api.select(f.eden, f.children, () => rolls.shift());
	assert.equal(first.childId, "one");
	assert.equal(first.variant, "A");
	assert.equal(f.api.select(f.eden, f.children, () => 0.9), null);
	f.window.Time.days = 13;
	assert.equal(f.api.select(f.eden, f.children, () => 0.9), null);
	f.window.Time.days = 14;
	assert.equal(f.api.select(f.eden, f.children, () => 0.9), null);
	f.window.Time.days = 15;
	const nextRolls = [0, 0.5];
	assert.equal(f.api.select(f.eden, f.children, () => nextRolls.shift()).variant, "B");
});

test("bed visits interrupt sleep after at least one completed hour, not after waking", () => {
	const f = fixture();
	assert.equal(f.api.trySleepInterrupt(f.eden, f.children, 0, () => 0), null);
	const result = f.api.trySleepInterrupt(f.eden, f.children, 1, () => 0);
	assert.equal(result.childId, "one");
	assert.equal(f.eden.bedVisit.interruptedSleep, true);
	assert.equal(f.api.trySleepInterrupt(f.eden, f.children, 2, () => 0), null);
});

test("each eligible sleep hour has an independent ten-percent roll", () => {
	const f = fixture();
	assert.equal(f.api.trySleepInterrupt(f.eden, f.children, 1, () => 0.1), null);
	assert.equal(f.eden.bedVisit.lastTriggeredDay, null);
	const rolls = [0.099, 0, 0.9];
	const result = f.api.trySleepInterrupt(f.eden, f.children, 2, () => rolls.shift());
	assert.equal(result.childId, "one");
	assert.equal(result.variant, "B");
});

test("a reprimand blocks future visits until an active invitation restores them", () => {
	const f = fixture();
	assert.equal(f.api.forbid(f.record), true);
	assert.equal(f.api.isEligible(f.record, f.children.one), false);
	assert.equal(f.api.restore(f.record), true);
	assert.equal(f.api.isEligible(f.record, f.children.one), true);
});

test("child penis detection uses explicit data first and gender as fallback", () => {
	const f = fixture();
	assert.equal(f.api.hasPenis({ gender: "m" }), true);
	assert.equal(f.api.hasPenis({ gender: "f" }), false);
	assert.equal(f.api.hasPenis({ gender: "f", penis: "small" }), true);
	assert.equal(f.api.hasPenis({ gender: "m", penis: "none" }), false);
});

test("A stores one hermaphrodite oral-target roll before combat", () => {
	const f = fixture();
	assert.equal(f.api.prepareEncounter(f.eden, "A", { penisExist: true, vaginaExist: true }, 1).oralTarget, "penis");
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true, vaginaExist: true }, { penis: "none", vagina: 0 }), "childOralPlayerPenis");
	f.api.prepareEncounter(f.eden, "A", { penisExist: true, vaginaExist: true }, 0);
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true, vaginaExist: true }, { penis: "none", vagina: 0 }), "childOralPlayerVagina");
});

test("B follows child-penis, player-penis, then trib priority", () => {
	const f = fixture();
	f.api.prepareEncounter(f.eden, "B", { penisExist: true, vaginaExist: true });
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true, vaginaExist: true }, { penis: 0, vagina: 0 }), "childPenisPlayerVagina");
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true, vaginaExist: false }, { penis: 0, vagina: 0 }), "childPenisPlayerAnus");
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true, vaginaExist: false }, { penis: "none", vagina: 0 }), "playerPenisChildVagina");
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true, vaginaExist: false }, { penis: "none", vagina: "none" }), "playerPenisChildAnus");
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: false, vaginaExist: true }, { penis: "none", vagina: 0 }), "trib");
});

test("ordinary invitations and completed encounters clear bed-visit context", () => {
	const f = fixture();
	f.api.prepareEncounter(f.eden, "B", { penisExist: true, vaginaExist: false });
	f.api.clearEncounterContext(f.eden);
	assert.equal(f.eden.encounterContext.source, null);
	assert.equal(f.api.resolveCombatStart(f.eden.encounterContext, { penisExist: true }, { vagina: 0 }), "none");
});
