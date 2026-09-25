(() => {
	"use strict";

	const dataVersion = 2;
	const eligibleSpecies = Object.freeze(["bird", "cat", "fox", "wolf", "cow"]);
	const config = Object.freeze({
		affection: Object.freeze({
			newResident: 40,
			existingResident: 50,
		}),
		lostContact: Object.freeze({ minimumAwareness: 70, maximumAffection: 40 }),
		university: Object.freeze({
			minimumAwareness: 60,
			minimumScore: 65,
			weights: Object.freeze({ knowledge: 0.6, awareness: 0.25, social: 0.15 }),
		}),
		careers: Object.freeze({
			teacher: Object.freeze({
				label: "教师",
				minimumScore: 70,
				minimums: Object.freeze({ knowledge: 65 }),
				weights: Object.freeze({ knowledge: 0.55, social: 0.25, awareness: 0.2 }),
				monthlyRemittance: 1200,
			}),
			worker: Object.freeze({
				label: "工人",
				minimumScore: 55,
				minimums: Object.freeze({ fitness: 50 }),
				weights: Object.freeze({ fitness: 0.7, social: 0.2, knowledge: 0.1 }),
				monthlyRemittance: 900,
			}),
			clerk: Object.freeze({
				label: "职员",
				minimumScore: 60,
				minimums: Object.freeze({ knowledge: 50, social: 50 }),
				weights: Object.freeze({ knowledge: 0.45, social: 0.4, awareness: 0.15 }),
				monthlyRemittance: 1100,
			}),
			criminal: Object.freeze({
				label: "犯罪者",
				minimumScore: 60,
				minimums: Object.freeze({}),
				weights: Object.freeze({ fitness: 0.4, social: 0.25, inverseAwareness: 0.35 }),
				monthlyRemittance: 1500,
			}),
			sexWorker: Object.freeze({
				label: "卖淫",
				minimumScore: 60,
				minimums: Object.freeze({}),
				weights: Object.freeze({ social: 0.35, appearance: 0.35, inverseAwareness: 0.3 }),
				monthlyRemittance: 1300,
			}),
			survival: Object.freeze({
				label: "勉强求生",
				minimumScore: 0,
				minimums: Object.freeze({}),
				weights: Object.freeze({}),
				monthlyRemittance: 0,
			}),
		}),
		careerOrder: Object.freeze({ normal: Object.freeze(["teacher", "clerk", "worker"]), risky: Object.freeze(["criminal", "sexWorker"]) }),
		remittance: Object.freeze({ affectionFloor: 30, fullAffection: 80 }),
		intimacy: Object.freeze({ minimumAffection: 40, difficultyBase: 5000, awarenessDifficulty: 50, affectionCenter: 50, affectionScale: 40 }),
	});
	const ratingRanges = Object.freeze([
		Object.freeze({ min: 10000, value: 6, label: "S" }),
		Object.freeze({ min: 8000, value: 5, label: "A" }),
		Object.freeze({ min: 6000, value: 4, label: "B" }),
		Object.freeze({ min: 4000, value: 3, label: "C" }),
		Object.freeze({ min: 2000, value: 2, label: "D" }),
		Object.freeze({ min: -Infinity, value: 1, label: "F" }),
	]);

	function clamp(value, min = 0, max = 100) {
		return Math.min(max, Math.max(min, Number(value) || 0));
	}

	function roundHundredth(value) {
		return Math.round(clamp(value) * 100) / 100;
	}

	function skillsOf(record) {
		return record?.training?.skills || { knowledge: 0, fitness: 0, social: 0, awareness: 0 };
	}

	function ensureAffection(record, child, fallback) {
		if (!record) return null;
		if (!Number.isFinite(record.affection)) {
			if (Number.isFinite(fallback)) record.affection = roundHundredth(fallback);
			else if (child?.location === "eden_home") record.affection = config.affection.existingResident;
		}
		if (Number.isFinite(record.affection)) record.affection = roundHundredth(record.affection);
		return record.affection;
	}

	function createAdultState() {
		return {
			dataVersion,
			pending: false,
			settled: false,
			outcome: null,
			destination: null,
			contactStatus: null,
			career: null,
			scores: null,
			settledDay: null,
			lastRemittanceMonth: null,
			encounter: null,
		};
	}

	function createEncounterState(childId) {
		return {
			dataVersion: 1,
			persistentKey: `eden_child:${String(childId)}`,
			count: 0,
			lastDay: null,
			inProgress: false,
		};
	}

	function ensureEncounterState(record, childId) {
		if (!record?.adult) return null;
		if (!record.adult.encounter || typeof record.adult.encounter !== "object" || Array.isArray(record.adult.encounter)) {
			record.adult.encounter = createEncounterState(childId);
		}
		const encounter = record.adult.encounter;
		encounter.dataVersion = 1;
		if (!encounter.persistentKey) encounter.persistentKey = `eden_child:${String(childId)}`;
		if (!Number.isFinite(encounter.count) || encounter.count < 0) encounter.count = 0;
		encounter.inProgress = encounter.inProgress === true;
		return encounter;
	}

	function normalizeAdultState(record) {
		if (!record.adult || typeof record.adult !== "object" || Array.isArray(record.adult)) record.adult = createAdultState();
		const adult = record.adult;
		adult.dataVersion = dataVersion;
		adult.pending = adult.pending === true;
		adult.settled = adult.settled === true;
		if (adult.encounter && typeof adult.encounter === "object") ensureEncounterState(record, record.childId);
		return adult;
	}

	function getMonthKey() {
		const time = window.Time;
		const year = Number(time?.year);
		const month = Number(time?.month);
		if (Number.isFinite(year) && Number.isFinite(month)) return year * 12 + month - 1;
		const days = Number(time?.days);
		return Number.isFinite(days) ? Math.floor(days / 30) : 0;
	}

	function applyAffection(record, amount) {
		if (!record) return 0;
		ensureAffection(record, null, config.affection.existingResident);
		const before = record.affection;
		record.affection = roundHundredth(record.affection + (Number(amount) || 0));
		return Math.round((record.affection - before) * 100) / 100;
	}

	function weightedScore(values, weights) {
		return Math.round(
			Object.entries(weights).reduce((total, [key, weight]) => {
				const value = key === "inverseAwareness" ? 100 - clamp(values.awareness) : clamp(values[key]);
				return total + value * weight;
			}, 0) * 100
		) / 100;
	}

	function getUniversityScore(record) {
		return weightedScore(skillsOf(record), config.university.weights);
	}

	function canAttendUniversity(record) {
		const skills = skillsOf(record);
		return clamp(skills.awareness) >= config.university.minimumAwareness && getUniversityScore(record) >= config.university.minimumScore;
	}

	function losesContact(record) {
		const awareness = clamp(skillsOf(record).awareness);
		const affection = clamp(record?.affection);
		return awareness >= config.lostContact.minimumAwareness && affection <= config.lostContact.maximumAffection;
	}

	function careerValues(record) {
		return {
			...skillsOf(record),
			appearance: clamp(record?.innate?.appearance),
		};
	}

	function getCareerScore(record, careerId) {
		const career = config.careers[careerId];
		if (!career) return 0;
		return weightedScore(careerValues(record), career.weights);
	}

	function passesCareer(record, careerId) {
		const career = config.careers[careerId];
		if (!career || careerId === "survival") return false;
		const values = careerValues(record);
		if (Object.entries(career.minimums).some(([key, minimum]) => clamp(values[key]) < minimum)) return false;
		return getCareerScore(record, careerId) >= career.minimumScore;
	}

	function bestCareer(record, careerIds) {
		return careerIds
			.filter(careerId => passesCareer(record, careerId))
			.map((careerId, priority) => ({ careerId, priority, score: getCareerScore(record, careerId) }))
			.sort((left, right) => right.score - left.score || left.priority - right.priority)[0]?.careerId;
	}

	function determineCareer(record) {
		return bestCareer(record, config.careerOrder.normal) || bestCareer(record, config.careerOrder.risky) || "survival";
	}

	function getAllScores(record) {
		return {
			university: getUniversityScore(record),
			teacher: getCareerScore(record, "teacher"),
			worker: getCareerScore(record, "worker"),
			clerk: getCareerScore(record, "clerk"),
			criminal: getCareerScore(record, "criminal"),
			sexWorker: getCareerScore(record, "sexWorker"),
		};
	}

	function previewOutcome(record) {
		if (losesContact(record)) return { outcome: "lost", destination: "away", contactStatus: "lost", career: null };
		if (canAttendUniversity(record)) return { outcome: "university", destination: "away", contactStatus: "active", career: null };
		return { outcome: "work", destination: "town", contactStatus: "active", career: determineCareer(record) };
	}

	function settle(record, child, choice = "resolve") {
		if (!record || !child || record.lifeStage !== "adult" || !eligibleSpecies.includes(record.species)) {
			return { ok: false, message: "这个孩子目前不能进行成年结算。" };
		}
		const adult = normalizeAdultState(record);
		if (adult.settled) return { ok: false, message: "这个孩子的未来已经结算。" };
		ensureAffection(record, child, config.affection.existingResident);

		const result = choice === "release"
			? { outcome: "released", destination: "away", contactStatus: "none", career: null }
			: previewOutcome(record);
		adult.pending = false;
		adult.settled = true;
		adult.outcome = result.outcome;
		adult.destination = result.destination;
		adult.contactStatus = result.contactStatus;
		adult.career = result.career;
		adult.scores = getAllScores(record);
		adult.settledDay = Number(window.Time?.days) || 0;
		adult.lastRemittanceMonth = getMonthKey();
		record.status = result.outcome === "released" ? "released" : "adult";
		child.location = result.outcome === "released" ? "eden_released" : "eden_contacts";
		return { ok: true, ...result };
	}

	function syncRecord(record, child) {
		if (!record || !child) return null;
		const adult = normalizeAdultState(record);
		if (!eligibleSpecies.includes(record.species)) return adult;
		ensureAffection(record, child);
		if (!adult.settled && record.lifeStage === "adult" && child.location === "eden_home") {
			adult.pending = true;
			record.status = "adult_pending";
		}
		return adult;
	}

	function syncAll(eden, children) {
		if (!eden?.children || !children) return;
		Object.entries(eden.children).forEach(([childId, record]) => syncRecord(record, children[childId]));
	}

	function needsSettlement(record, child) {
		return Boolean(
			record &&
			child &&
			eligibleSpecies.includes(record.species) &&
			record.lifeStage === "adult" &&
			child.location === "eden_home" &&
			!record.adult?.settled
		);
	}

	function isContact(record) {
		return Boolean(record?.adult?.settled && record.adult.outcome !== "released");
	}

	function outcomeLabel(record) {
		const adult = record?.adult;
		if (!adult?.settled) return "待结算";
		if (adult.outcome === "lost") return "失联";
		if (adult.outcome === "university") return "离开小镇·上大学";
		if (adult.outcome === "released") return "放生";
		return `留在小镇·${config.careers[adult.career]?.label || "勉强求生"}`;
	}

	function getAffectionFactor(record) {
		const affection = clamp(record?.affection);
		const { affectionFloor, fullAffection } = config.remittance;
		return Math.min(1, Math.max(0, (affection - affectionFloor) / (fullAffection - affectionFloor)));
	}

	function getMonthlyRemittance(record) {
		const career = config.careers[record?.adult?.career];
		if (!career) return 0;
		return Math.round((career.monthlyRemittance * getAffectionFactor(record)) / 10) * 10;
	}

	function getUnclaimedMonths(record) {
		if (record?.adult?.outcome !== "work") return 0;
		const lastMonth = Number(record.adult.lastRemittanceMonth);
		if (!Number.isFinite(lastMonth)) {
			record.adult.lastRemittanceMonth = getMonthKey();
			return 0;
		}
		return Math.max(0, getMonthKey() - lastMonth);
	}

	function claimRemittance(record) {
		const months = getUnclaimedMonths(record);
		if (months <= 0) return { ok: false, months: 0, pounds: 0, pennies: 0, message: "本月还没有新的汇款。" };
		const pounds = getMonthlyRemittance(record) * months;
		record.adult.lastRemittanceMonth = getMonthKey();
		return {
			ok: true,
			months,
			pounds,
			pennies: pounds * 100,
			message: pounds > 0 ? `收到了 ${months} 个月的汇款。` : `这 ${months} 个月没有收到汇款。`,
		};
	}

	function canInviteIntimacy(record) {
		return Boolean(
			record?.adult?.settled &&
			record.adult.destination === "town" &&
			record.adult.contactStatus === "active" &&
			clamp(record.affection) >= config.intimacy.minimumAffection
		);
	}

	function ratingFor(rawValue) {
		return ratingRanges.find(range => rawValue >= range.min);
	}

	function checkIntimacy(record, attractiveness, seductionSkill) {
		if (!canInviteIntimacy(record)) return { ok: false, success: false, message: "目前不能发出这样的邀请。" };
		const affectionModifier = (clamp(record.affection) - config.intimacy.affectionCenter) * config.intimacy.affectionScale;
		const rawRating = (Number(attractiveness) || 0) + (Number(seductionSkill) || 0) * 5 + affectionModifier;
		const rawDifficulty = config.intimacy.difficultyBase + clamp(skillsOf(record).awareness) * config.intimacy.awarenessDifficulty;
		const rating = ratingFor(rawRating);
		const required = ratingFor(rawDifficulty);
		return {
			ok: true,
			success: rating.value >= required.value,
			rawRating: Math.round(rawRating),
			rawDifficulty: Math.round(rawDifficulty),
			rating: rating.label,
			required: required.label,
			affectionModifier: Math.round(affectionModifier),
		};
	}

	function prepareEncounterNpc(record, child, childId, npc) {
		if (!record || !child || !npc) return null;
		const encounter = ensureEncounterState(record, childId);
		const name = String(child.name || "未命名的孩子");
		const gender = ["m", "f", "h"].includes(child.gender) ? child.gender : "f";
		npc.name = name;
		npc.name_known = 1;
		npc.fullDescription = `Eden child ${String(childId)}`;
		npc.adult = 1;
		npc.teen = 0;
		npc.gender = gender;
		npc.pronoun = gender === "m" ? "m" : "f";
		npc.edenChildId = String(childId);
		npc.edenSpecies = record.species || "human";
		npc.type = ["wolf", "wolfboy", "wolfgirl", "hawk", "harpy"].includes(child.type) ? child.type : "human";
		npc.per = encounter.persistentKey;
		return encounter;
	}

	function beginEncounter(record, childId) {
		const encounter = ensureEncounterState(record, childId);
		if (!encounter) return null;
		encounter.inProgress = true;
		return encounter;
	}

	function completeEncounter(record, childId) {
		const encounter = ensureEncounterState(record, childId);
		if (!encounter || !encounter.inProgress) return false;
		encounter.inProgress = false;
		encounter.count += 1;
		encounter.lastDay = Number(window.Time?.days) || 0;
		return true;
	}

	window.EdenAdult = Object.freeze({
		dataVersion,
		eligibleSpecies,
		config,
		ensureAffection,
		applyAffection,
		getUniversityScore,
		canAttendUniversity,
		losesContact,
		getCareerScore,
		passesCareer,
		determineCareer,
		getAllScores,
		previewOutcome,
		settle,
		syncRecord,
		syncAll,
		needsSettlement,
		isContact,
		outcomeLabel,
		getAffectionFactor,
		getMonthlyRemittance,
		getUnclaimedMonths,
		claimRemittance,
		canInviteIntimacy,
		checkIntimacy,
		ensureEncounterState,
		prepareEncounterNpc,
		beginEncounter,
		completeEncounter,
	});
})();
