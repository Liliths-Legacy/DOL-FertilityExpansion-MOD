(() => {
	"use strict";

	const dataVersion = 3;
	const eligibleSpecies = Object.freeze(["bird", "cat", "fox", "wolf", "cow", "other"]);
	function isSupportedSpecies(record) {
		return Boolean(record && window.EdenAge?.isCultivableSpecies(record));
	}
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
		universityCareers: Object.freeze({
			legislator: Object.freeze({
				label: "议员",
				minimumScore: 76,
				minimums: Object.freeze({ social: 70, awareness: 70 }),
				weights: Object.freeze({ social: 0.35, awareness: 0.25, appearance: 0.15, activeAffinity: 0.1, knowledge: 0.1, intelligence: 0.05 }),
				monthlyRemittance: 3200,
			}),
			athlete: Object.freeze({
				label: "运动员",
				minimumScore: 74,
				minimums: Object.freeze({ fitness: 75, innateFitness: 60 }),
				weights: Object.freeze({ fitness: 0.45, innateFitness: 0.25, awareness: 0.1, social: 0.1, activeAffinity: 0.1 }),
				monthlyRemittance: 2800,
			}),
			professor: Object.freeze({
				label: "大学教授",
				minimumScore: 78,
				minimums: Object.freeze({ knowledge: 80, intelligence: 70 }),
				weights: Object.freeze({ knowledge: 0.4, intelligence: 0.25, awareness: 0.15, quietAffinity: 0.1, social: 0.1 }),
				monthlyRemittance: 2600,
			}),
			actor: Object.freeze({
				label: "演员",
				minimumScore: 74,
				minimums: Object.freeze({ appearance: 65, social: 65 }),
				weights: Object.freeze({ appearance: 0.3, social: 0.3, activeAffinity: 0.15, awareness: 0.1, intelligence: 0.1, knowledge: 0.05 }),
				monthlyRemittance: 3100,
			}),
			merchant: Object.freeze({
				label: "商人",
				minimumScore: 72,
				minimums: Object.freeze({ social: 65, awareness: 65 }),
				weights: Object.freeze({ social: 0.25, awareness: 0.2, knowledge: 0.2, intelligence: 0.15, appearance: 0.1, activeAffinity: 0.1 }),
				monthlyRemittance: 3500,
			}),
			doctor: Object.freeze({
				label: "医生",
				minimumScore: 80,
				minimums: Object.freeze({ knowledge: 82, awareness: 75, intelligence: 70 }),
				weights: Object.freeze({ knowledge: 0.35, awareness: 0.25, intelligence: 0.2, quietAffinity: 0.1, social: 0.1 }),
				monthlyRemittance: 3000,
			}),
			corporateEmployee: Object.freeze({
				label: "公司职员",
				minimumScore: 0,
				minimums: Object.freeze({}),
				weights: Object.freeze({}),
				monthlyRemittance: 1600,
			}),
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
		universityCareerOrder: Object.freeze(["doctor", "professor", "legislator", "athlete", "actor", "merchant"]),
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
	const contactPageSize = 6;

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
			education: null,
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
		if (adult.settled && ["university", "awayWork"].includes(adult.outcome)) {
			adult.outcome = "awayWork";
			adult.destination = "away";
			adult.contactStatus = adult.contactStatus || "active";
			adult.education = "university";
			if (!config.universityCareers[adult.career]) adult.career = determineUniversityCareer(record);
			adult.scores = { ...(adult.scores || {}), ...getUniversityCareerScores(record) };
		}
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
		const innate = record?.innate || {};
		const temperament = Number.isFinite(innate.temperament) ? clamp(innate.temperament, 1, 100) : 50;
		return {
			...skillsOf(record),
			appearance: clamp(innate.appearance),
			innateFitness: clamp(innate.fitness),
			intelligence: clamp(innate.intelligence),
			activeAffinity: temperament,
			quietAffinity: 101 - temperament,
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

	function getUniversityCareerScore(record, careerId) {
		const career = config.universityCareers[careerId];
		if (!career) return 0;
		return weightedScore(careerValues(record), career.weights);
	}

	function passesUniversityCareer(record, careerId) {
		const career = config.universityCareers[careerId];
		if (!career || careerId === "corporateEmployee") return false;
		const values = careerValues(record);
		if (Object.entries(career.minimums).some(([key, minimum]) => clamp(values[key]) < minimum)) return false;
		return getUniversityCareerScore(record, careerId) >= career.minimumScore;
	}

	function determineUniversityCareer(record) {
		return config.universityCareerOrder
			.filter(careerId => passesUniversityCareer(record, careerId))
			.map((careerId, priority) => {
				const score = getUniversityCareerScore(record, careerId);
				return { careerId, priority, margin: score - config.universityCareers[careerId].minimumScore };
			})
			.sort((left, right) => right.margin - left.margin || left.priority - right.priority)[0]?.careerId || "corporateEmployee";
	}

	function getUniversityCareerScores(record) {
		return Object.fromEntries(
			Object.keys(config.universityCareers)
				.filter(careerId => careerId !== "corporateEmployee")
				.map(careerId => [careerId, getUniversityCareerScore(record, careerId)])
		);
	}

	function getAllScores(record) {
		return {
			university: getUniversityScore(record),
			teacher: getCareerScore(record, "teacher"),
			worker: getCareerScore(record, "worker"),
			clerk: getCareerScore(record, "clerk"),
			criminal: getCareerScore(record, "criminal"),
			sexWorker: getCareerScore(record, "sexWorker"),
			...getUniversityCareerScores(record),
		};
	}

	function previewOutcome(record) {
		if (losesContact(record)) return { outcome: "lost", destination: "away", contactStatus: "lost", career: null };
		if (canAttendUniversity(record)) return { outcome: "awayWork", destination: "away", contactStatus: "active", education: "university", career: determineUniversityCareer(record) };
		return { outcome: "work", destination: "town", contactStatus: "active", education: null, career: determineCareer(record) };
	}

	function settle(record, child, choice = "resolve") {
		if (
			!record ||
			!child ||
			record.lifeStage !== "adult" ||
			!isSupportedSpecies(record) ||
			window.EdenAge?.isHumanoid(record, child) !== true
		) {
			return { ok: false, message: "这个孩子目前不能进行成年结算。" };
		}
		const adult = normalizeAdultState(record);
		if (adult.settled) return { ok: false, message: "这个孩子的未来已经结算。" };
		ensureAffection(record, child, config.affection.existingResident);

		const result = choice === "release"
			? { outcome: "released", destination: "away", contactStatus: "none", education: null, career: null }
			: previewOutcome(record);
		adult.pending = false;
		adult.settled = true;
		adult.outcome = result.outcome;
		adult.destination = result.destination;
		adult.contactStatus = result.contactStatus;
		adult.education = result.education || null;
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
		if (!isSupportedSpecies(record)) return adult;
		ensureAffection(record, child);
		if (window.EdenAge?.isHumanoid(record, child) !== true) {
			if (!adult.settled) {
				adult.pending = false;
				if (record.status === "adult_pending") record.status = "resident";
			}
			return adult;
		}
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
			isSupportedSpecies(record) &&
			window.EdenAge?.isHumanoid(record, child) === true &&
			record.lifeStage === "adult" &&
			child.location === "eden_home" &&
			!record.adult?.settled
		);
	}

	function isContact(record) {
		return Boolean(record?.adult?.settled && record.adult.outcome !== "released");
	}

	function ensureContactView(eden) {
		if (!eden) return null;
		if (!eden.contactsView || typeof eden.contactsView !== "object" || Array.isArray(eden.contactsView)) {
			eden.contactsView = { page: 1, timeOrder: "newest", locationOrder: "none", remittanceFirst: false };
		}
		const view = eden.contactsView;
		view.page = Math.max(1, Math.floor(Number(view.page) || 1));
		if (!['newest', 'oldest'].includes(view.timeOrder)) view.timeOrder = "newest";
		if (!['none', 'townFirst', 'awayFirst'].includes(view.locationOrder)) view.locationOrder = "none";
		view.remittanceFirst = view.remittanceFirst === true;
		return view;
	}

	function getSortedContactIds(eden) {
		const view = ensureContactView(eden);
		if (!view || !eden.children) return [];
		return Object.keys(eden.children)
			.filter(id => isContact(eden.children[id]))
			.sort((leftId, rightId) => {
				const left = eden.children[leftId];
				const right = eden.children[rightId];
				if (view.remittanceFirst) {
					const pendingDifference = Number(getUnclaimedMonths(right) > 0) - Number(getUnclaimedMonths(left) > 0);
					if (pendingDifference) return pendingDifference;
				}
				if (view.locationOrder !== "none") {
					const preferred = view.locationOrder === "townFirst" ? "town" : "away";
					const locationDifference = Number(right.adult?.destination === preferred) - Number(left.adult?.destination === preferred);
					if (locationDifference) return locationDifference;
				}
				const leftDay = Number(left.adult?.settledDay) || 0;
				const rightDay = Number(right.adult?.settledDay) || 0;
				const timeDifference = view.timeOrder === "oldest" ? leftDay - rightDay : rightDay - leftDay;
				return timeDifference || String(leftId).localeCompare(String(rightId));
			});
	}

	function outcomeLabel(record) {
		const adult = record?.adult;
		if (!adult?.settled) return "待结算";
		if (adult.outcome === "lost") return "失联";
		if (adult.outcome === "university") return "离开小镇·上大学";
		if (adult.outcome === "awayWork") return `离开小镇·${config.universityCareers[adult.career]?.label || "公司职员"}（大学）`;
		if (adult.outcome === "released") return "放生";
		return `留在小镇·${config.careers[adult.career]?.label || "勉强求生"}`;
	}

	function destinationLabel(record) {
		return record?.adult?.destination === "town" ? "留在小镇" : "离开小镇";
	}

	function adultRoleLabel(record) {
		const adult = record?.adult;
		if (!adult?.settled) return "待结算";
		if (adult.outcome === "lost") return "失联";
		if (adult.outcome === "awayWork" || adult.outcome === "university") {
			return config.universityCareers[adult.career]?.label || "公司职员";
		}
		return config.careers[adult.career]?.label || "勉强求生";
	}

	function adulthoodDays(record) {
		const currentDay = Number(window.Time?.days);
		const settledDay = Number(record?.adult?.settledDay);
		if (!Number.isFinite(currentDay) || !Number.isFinite(settledDay)) return 0;
		return Math.max(0, Math.floor(currentDay - settledDay));
	}

	function getAffectionFactor(record) {
		const affection = clamp(record?.affection);
		const { affectionFloor, fullAffection } = config.remittance;
		return Math.min(1, Math.max(0, (affection - affectionFloor) / (fullAffection - affectionFloor)));
	}

	function getMonthlyRemittance(record) {
		const careerId = record?.adult?.career;
		const career = config.careers[careerId] || config.universityCareers[careerId];
		if (!career) return 0;
		return Math.round((career.monthlyRemittance * getAffectionFactor(record)) / 10) * 10;
	}

	function canReceiveRemittance(record) {
		return Boolean(
			record?.adult?.settled &&
			record.adult.contactStatus === "active" &&
			["work", "awayWork"].includes(record.adult.outcome) &&
			getMonthlyRemittance(record) >= 0
		);
	}

	function getUnclaimedMonths(record) {
		if (!canReceiveRemittance(record)) return 0;
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
			record?.bodyForm !== "beast" &&
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
		if (!record || !child || !npc || window.EdenAge?.isHumanoid(record, child) !== true) return null;
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
		if (record?.bodyForm === "beast") return null;
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
		contactPageSize,
		eligibleSpecies,
		isSupportedSpecies,
		config,
		ensureAffection,
		applyAffection,
		getUniversityScore,
		canAttendUniversity,
		losesContact,
		getCareerScore,
		passesCareer,
		determineCareer,
		getUniversityCareerScore,
		passesUniversityCareer,
		determineUniversityCareer,
		getAllScores,
		previewOutcome,
		settle,
		syncRecord,
		syncAll,
		needsSettlement,
		isContact,
		ensureContactView,
		getSortedContactIds,
		outcomeLabel,
		destinationLabel,
		adultRoleLabel,
		adulthoodDays,
		getAffectionFactor,
		getMonthlyRemittance,
		canReceiveRemittance,
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
