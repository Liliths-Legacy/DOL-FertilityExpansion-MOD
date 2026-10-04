(() => {
	"use strict";
	const transferFee = 10000000;
	const sources = Object.freeze(["home", "wolf_cave", "tower", "alex_cottage"]);
	const variables = () => window.SugarCube?.State?.variables || {};

	function residentIds(vars = variables()) {
		// Laid eggs reserve space; unborn fetuses do not occupy a room.
		return window.EdenChildData.entries({ location: "eden_home" }, vars).map(([id]) => id);
	}

	function inspectTransfer(eden, childId, source, vars = variables()) {
		const data = window.EdenChildData;
		const child = data.get(childId, vars);
		const record = eden?.children?.[childId];
		const fail = (code, message, eligible = false) => ({ ok: false, eligible, code, message });
		if (window.EdenSaveMigration?.ensureReady() === false) return fail("migration", "旧资料尚未完成转换，暂时无法转移孩子。");
		if (!eden?.facility?.owned) return fail("ownership", "你还没有能安置孩子的地方。");
		if (!sources.includes(source) || !child || !record) return fail("missing", "你无法确认要带走的孩子。");
		const parents = data.parentsOf(child, vars);
		const adoptedHawk = source === "tower" && data.baseSpecies(child) === "hawk" && data.isAdopted(child);
		if (parents.mother !== "pc" && parents.father !== "pc" && !adoptedHawk) return fail("parent", "你无法确认要带走的孩子。");
		if (data.locationOf(child) !== source) return fail("location", "这个孩子已经不在这里了。");
		if (data.phaseOf(child, vars) === "egg") return fail("egg", "这枚蛋还没有孵化，现在还不能带去伊甸园。");
		if (data.phaseOf(child, vars) !== "born") return fail("unborn", "这个孩子尚未出生，暂时无法转移。");
		if (window.EdenAge?.isHumanoid(record, child) !== true) return fail("body", "这个孩子保持着动物形态，暂时不适合带到伊甸园抚养。");
		if (record.adult?.settled) return fail("settled", "这个孩子的未来已经确定，不能重新入住育儿室。");
		const capacity = Number(eden.facility.capacity);
		if (!Number.isInteger(capacity) || residentIds(vars).length >= capacity) return fail("capacity", "伊甸园已经没有空位。", true);
		const cost = source === "home" ? transferFee : 0;
		if (cost > 0 && (Number(vars.money) || 0) < cost) return fail("money", "你拿不出贝利要求的 £100,000。", true);
		return { ok: true, eligible: true, code: "ready", message: "可以将孩子带至伊甸园。", cost };
	}

	function move(eden, childId, source, vars = variables()) {
		// Revalidate on the click, not just when the passage was rendered.
		const check = inspectTransfer(eden, childId, source, vars);
		if (!check.ok) return check;
		const child = window.EdenChildData.get(childId, vars);
		const record = eden.children[childId];
		if (check.cost > 0) {
			if (typeof window.statChange?.money === "function") window.statChange.money(-check.cost, "edenChildTransfer");
			else vars.money -= check.cost;
		}
		window.EdenChildData.setLocation(child, "eden_home", vars);
		record.status = "resident";
		record.transferSource = source;
		if (check.cost > 0) record.transferPaid = true;
		if ((vars.options?.eden || eden.settings)?.resetAgeOnTransfer === true) window.EdenAge.resetGrowthAge(record);
		if (!Number.isFinite(record.affection)) record.affection = 40;
		if (window.EdenTraining) {
			record.training = window.EdenTraining.normalizeTraining(record.training);
			const day = window.EdenTraining.getSettlementDay();
			if (Number.isFinite(day)) record.training.lastProcessedDay = day;
		}
		window.EdenAge?.syncRecord(record, child, eden.settings);
		window.EdenAdult?.syncRecord(record, child);
		delete eden.childListReturn;
		delete eden.transferSource;
		return { ok: true, eligible: true, code: "moved", cost: check.cost, childId: String(childId), message: "孩子已经入住伊甸园。" };
	}

	window.EdenFacility = Object.freeze({ transferFee, sources, residentIds, inspectTransfer, move });
})();
