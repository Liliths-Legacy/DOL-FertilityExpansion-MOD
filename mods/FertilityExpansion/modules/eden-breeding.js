(() => {
	"use strict";

	const dataVersion = 1;

	function variables() {
		return window.SugarCube?.State?.variables || {};
	}

	function currentDay() {
		const time = window.Time;
		if (!time) return 0;
		const value = Date.UTC(Number(time.year) || 0, (Number(time.month) || 1) - 1, Number(time.monthDay) || 1);
		return Math.floor(value / 86400000);
	}

	function descriptionFor(childId) {
		return `Eden child ${String(childId)}`;
	}

	function childIdFromDescription(name) {
		if (typeof name !== "string") return null;
		const prefix = "Eden child ";
		return name.startsWith(prefix) ? name.slice(prefix.length) : null;
	}

	function parentDisplayName(name, children = variables().children) {
		const childId = childIdFromDescription(name);
		if (childId === null) return null;
		const childName = children?.[childId]?.name;
		return typeof childName === "string" && childName.trim() ? childName : "未命名的孩子";
	}

	function installPregnancyNameCorrection() {
		const original = window.pregnancyNameCorrection;
		if (typeof original !== "function" || original.edenParentNames === true) return false;
		const corrected = function edenPregnancyNameCorrection(name, caps = false) {
			const displayName = parentDisplayName(name);
			return displayName === null ? original(name, caps) : displayName;
		};
		corrected.edenParentNames = true;
		corrected.edenOriginal = original;
		window.pregnancyNameCorrection = corrected;
		return true;
	}

	function ensureRoot(eden) {
		if (!eden.breeding || typeof eden.breeding !== "object" || Array.isArray(eden.breeding)) {
			eden.breeding = { dataVersion, parentsByDescription: {}, activeBirthParentId: null, lastBirthResult: null };
		}
		eden.breeding.dataVersion = dataVersion;
		if (!eden.breeding.parentsByDescription || typeof eden.breeding.parentsByDescription !== "object") {
			eden.breeding.parentsByDescription = {};
		}
		return eden.breeding;
	}

	function registerParent(eden, childId) {
		const root = ensureRoot(eden);
		root.parentsByDescription[descriptionFor(childId)] = String(childId);
	}

	function pregnancyMultiplier(type, settings) {
		switch (type) {
			case "human":
				return 9 / (Number(settings?.humanPregnancyMonths) || 9);
			case "wolf":
				return 12 / (Number(settings?.wolfPregnancyWeeks) || 12);
			default:
				return 1;
		}
	}

	function normalizePregnancy(pregnancy, childId) {
		if (!pregnancy || !Array.isArray(pregnancy.fetus) || pregnancy.fetus.length === 0) return null;
		pregnancy.edenDataVersion = dataVersion;
		pregnancy.edenParentChildId = String(childId);
		pregnancy.lastProgressDay = Number.isFinite(pregnancy.lastProgressDay) ? pregnancy.lastProgressDay : currentDay();
		pregnancy.givenBirth = Number.isFinite(pregnancy.givenBirth) ? pregnancy.givenBirth : 0;
		pregnancy.totalBirthEvents = Number.isFinite(pregnancy.totalBirthEvents) ? pregnancy.totalBirthEvents : 0;
		pregnancy.fetus.forEach(fetus => {
			fetus.edenGeneticParentId = String(childId);
		});
		return pregnancy;
	}

	function captureStoredPregnancy(eden, record, childId, storedNPCs) {
		if (!record?.adult || !storedNPCs) return false;
		const description = descriptionFor(childId);
		const entry = Object.entries(storedNPCs).find(([, stored]) => stored?.npc?.fullDescription === description && stored?.pregnancy?.fetus?.length);
		if (!entry) return false;
		const [key, stored] = entry;
		if (!record.adult.pregnancy?.fetus?.length) {
			record.adult.pregnancy = normalizePregnancy(stored.pregnancy, childId);
		}
		delete storedNPCs[key];
		registerParent(eden, childId);
		return true;
	}

	function prepareEncounterNpc(record, npc) {
		if (!npc) return;
		npc.pregnancy = record?.adult?.pregnancy?.fetus?.length ? 1 : 0;
	}

	function captureEncounterPregnancy(eden, children, record, childId) {
		if (!eden || !record || !childId) return false;
		registerParent(eden, childId);
		const vars = variables();
		const captured = captureStoredPregnancy(eden, record, childId, vars.storedNPCs);
		syncPlayerPregnancies(eden, vars);
		syncGeneticLinks(eden, children, vars);
		return captured;
	}

	function syncPlayerPregnancies(eden, vars = variables()) {
		const root = ensureRoot(eden);
		for (const genital of ["vagina", "anus"]) {
			const fetus = vars.sexStats?.[genital]?.pregnancy?.fetus;
			if (!Array.isArray(fetus)) continue;
			fetus.forEach(child => {
				const parentId = root.parentsByDescription[child?.father] || root.parentsByDescription[child?.mother];
				if (parentId) child.edenGeneticParentId = String(parentId);
			});
		}
	}

	function syncGeneticLinks(eden, children, vars = variables()) {
		if (!eden?.children || !children) return;
		const root = ensureRoot(eden);
		Object.entries(children).forEach(([childId, child]) => {
			const parentId = child?.edenGeneticParentId || root.parentsByDescription[child?.father] || root.parentsByDescription[child?.mother];
			if (parentId && eden.children[childId]) eden.children[childId].geneticParentId = String(parentId);
		});
	}

	function progressPregnancy(record, settings, day = currentDay()) {
		const pregnancy = record?.adult?.pregnancy;
		if (!pregnancy?.fetus?.length || variables().statFreeze) return false;
		const lastDay = Number.isFinite(pregnancy.lastProgressDay) ? pregnancy.lastProgressDay : day;
		const elapsed = Math.max(0, day - lastDay);
		if (elapsed > 0) {
			pregnancy.timer = (Number(pregnancy.timer) || 0) + pregnancyMultiplier(pregnancy.type, settings) * elapsed;
			pregnancy.lastProgressDay = day;
		}
		pregnancy.due = (Number(pregnancy.timer) || 0) >= (Number(pregnancy.timerEnd) || Infinity);
		return pregnancy.due;
	}

	function syncAll(eden, children, vars = variables()) {
		if (!eden?.children || !children) return;
		installPregnancyNameCorrection();
		ensureRoot(eden);
		Object.entries(eden.children).forEach(([childId, record]) => {
			if (record?.adult?.settled) registerParent(eden, childId);
			captureStoredPregnancy(eden, record, childId, vars.storedNPCs);
			progressPregnancy(record, vars.settings);
		});
		syncPlayerPregnancies(eden, vars);
		syncGeneticLinks(eden, children, vars);
	}

	function nextDue(eden) {
		if (!eden?.children) return null;
		return Object.keys(eden.children).find(childId => {
			const pregnancy = eden.children[childId]?.adult?.pregnancy;
			return pregnancy?.due && pregnancy.deliveryBlocked !== true;
		}) || null;
	}

	function pregnancyStatus(record) {
		const pregnancy = record?.adult?.pregnancy;
		if (!pregnancy?.fetus?.length) return null;
		const timer = Math.max(0, Number(pregnancy.timer) || 0);
		const end = Math.max(1, Number(pregnancy.timerEnd) || 1);
		return {
			count: pregnancy.fetus.length,
			percent: Math.min(100, Math.floor((timer / end) * 100)),
			due: timer >= end,
		};
	}

	function residentCount(children) {
		return Object.values(children || {}).filter(child => child?.location === "eden_home").length;
	}

	function birthLocation(type, destination) {
		if (destination === "eden_home") return "eden_home";
		if (type === "wolf") return "wolf_cave";
		if (type === "hawk") return "tower";
		return "hospital";
	}

	function resolveOriginalGiveBirth() {
		if (typeof window.giveBirthToChildren === "function") return window.giveBirthToChildren;
		/* DoL 0.5.11.9 declares this as a global function but, unlike most
		 * pregnancy helpers, does not explicitly export it on window. */
		if (typeof giveBirthToChildren === "function") return giveBirthToChildren;
		return null;
	}

	function retryDelivery(record) {
		const pregnancy = record?.adult?.pregnancy;
		if (!pregnancy?.fetus?.length) return false;
		delete pregnancy.deliveryBlocked;
		delete pregnancy.lastDeliveryError;
		pregnancy.due = true;
		return true;
	}

	function deliver(eden, children, parentId, vars = variables()) {
		const record = eden?.children?.[parentId];
		const parent = children?.[parentId];
		const pregnancy = record?.adult?.pregnancy;
		if (!record || !parent || !pregnancy?.fetus?.length || !pregnancy.due) {
			return { ok: false, message: "现在没有可以结算的生产。" };
		}

		const childIds = pregnancy.fetus.map(fetus => String(fetus.childId));
		pregnancy.fetus.forEach(fetus => {
			fetus.edenGeneticParentId = String(parentId);
		});
		const free = Math.max(0, (Number(eden.facility?.capacity) || 0) - residentCount(children));
		const destination = eden.facility?.owned && free >= pregnancy.fetus.length ? "eden_home" : "home";
		const description = descriptionFor(parentId);
		const giveBirth = resolveOriginalGiveBirth();
		let delivered = false;
		let deliveryError = null;
		try {
			delivered = typeof giveBirth === "function" && giveBirth(description, birthLocation(pregnancy.type, destination), destination, pregnancy) === true;
		} catch (error) {
			deliveryError = error;
		}
		if (!delivered || childIds.some(childId => !children[childId])) {
			pregnancy.deliveryBlocked = true;
			pregnancy.lastDeliveryError = String(deliveryError?.message || (giveBirth ? "child creation failed" : "birth function unavailable"));
			return { ok: false, parentId: String(parentId), message: "原版生产流程未能完成。你可以返回通讯录，稍后再次尝试。" };
		}

		childIds.forEach(childId => {
			if (!eden.children[childId]) {
				eden.children[childId] = { childId, profile: "", status: destination === "eden_home" ? "resident" : "active", dataVersion: 6 };
			}
			eden.children[childId].geneticParentId = String(parentId);
		});
		record.adult.pregnancy = null;
		record.adult.birthEvents = (Number(record.adult.birthEvents) || 0) + 1;
		vars.pregnancyStats.npcTotalBirthEvents = (Number(vars.pregnancyStats.npcTotalBirthEvents) || 0) + 1;
		window.EdenTraits?.syncAll?.(eden, children, vars);
		const result = { ok: true, parentId: String(parentId), childIds, count: childIds.length, destination };
		ensureRoot(eden).lastBirthResult = result;
		return result;
	}

	window.EdenBreeding = Object.freeze({
		dataVersion,
		descriptionFor,
		parentDisplayName,
		installPregnancyNameCorrection,
		ensureRoot,
		prepareEncounterNpc,
		captureEncounterPregnancy,
		syncAll,
		nextDue,
		pregnancyStatus,
		retryDelivery,
		deliver,
	});
})();
