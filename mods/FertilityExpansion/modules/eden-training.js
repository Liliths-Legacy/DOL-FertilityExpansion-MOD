(() => {
	"use strict";

	const dataVersion = 3;
	const eligibleSpecies = Object.freeze(["bird", "cat", "fox", "wolf", "cow"]);
	const eligibleStages = Object.freeze(["toddler", "child", "adolescent"]);
	const skillLabels = Object.freeze({
		knowledge: "学识",
		fitness: "体能",
		social: "社交",
		awareness: "意识",
	});
	const config = Object.freeze({
		referenceMaturityDays: 90,
		settlementHour: 8,
		slotsPerDay: 3,
		aptitudeBase: 0.8,
		aptitudeDivisor: 250,
		diminishingDivisor: 200,
		passiveAwareness: Object.freeze({
			toddler: 0.15,
			child: 0.3,
			adolescent: 0.45,
		}),
		personalityMultipliers: Object.freeze({
			quiet: Object.freeze({ knowledge: 1.1, fitness: 0.95, social: 0.9, awareness: 1 }),
			active: Object.freeze({ knowledge: 0.9, fitness: 1.05, social: 1.1, awareness: 1 }),
		}),
		activities: Object.freeze({
			rest: Object.freeze({ label: "休息", minimumStage: "toddler", cost: 0, effects: Object.freeze({}) }),
			pictureBook: Object.freeze({ label: "看图画书", minimumStage: "toddler", cost: 0, effects: Object.freeze({ knowledge: 0.7 }) }),
			textbook: Object.freeze({ label: "看教材", minimumStage: "child", cost: 0, effects: Object.freeze({ knowledge: 1 }) }),
			novel: Object.freeze({ label: "看小说", minimumStage: "child", cost: 0, effects: Object.freeze({ knowledge: 0.45, social: 0.45 }) }),
			history: Object.freeze({ label: "看历史", minimumStage: "child", cost: 0, effects: Object.freeze({ knowledge: 0.45, awareness: 0.55 }) }),
			toys: Object.freeze({ label: "玩玩具", minimumStage: "toddler", cost: 0, effects: Object.freeze({ awareness: -0.6 }) }),
			outdoors: Object.freeze({ label: "户外玩耍", minimumStage: "toddler", cost: 0, effects: Object.freeze({ social: 0.5, fitness: 0.65 }) }),
			communitySchool: Object.freeze({
				label: "社区学校",
				minimumStage: "adolescent",
				cost: 2000,
				effects: Object.freeze({ knowledge: 1.2, awareness: -0.2 }),
			}),
			privateTutor: Object.freeze({
				label: "私人家教",
				minimumStage: "adolescent",
				cost: 10000,
				effects: Object.freeze({ knowledge: 1.6, awareness: 0.25 }),
			}),
			socialWork: Object.freeze({
				label: "社会工作",
				minimumStage: "adolescent",
				cost: 0,
				effects: Object.freeze({ fitness: 0.85, social: 0.75 }),
			}),
			talk: Object.freeze({
				label: "谈话",
				minimumStage: "adolescent",
				cost: 0,
				effects: Object.freeze({ awareness: 0.6 }),
			}),
		}),
	});
	const stageOrder = Object.freeze({ infant: 0, toddler: 1, child: 2, adolescent: 3, adult: 4 });

	function getVariables() {
		return window.SugarCube?.State?.variables || {};
	}

	function getCurrentDay() {
		return Number(window.Time?.days);
	}

	function getCurrentHour() {
		return Number(window.Time?.hour);
	}

	function getSettlementDay() {
		const day = getCurrentDay();
		const hour = getCurrentHour();
		if (!Number.isFinite(day) || !Number.isFinite(hour)) return null;
		return hour >= config.settlementHour ? day : day - 1;
	}

	function getPlanningDay() {
		const day = getCurrentDay();
		const hour = getCurrentHour();
		if (!Number.isFinite(day) || !Number.isFinite(hour)) return null;
		return hour < config.settlementHour ? day : day + 1;
	}

	function roundSkill(value) {
		return Math.round(Math.min(100, Math.max(0, Number(value) || 0)) * 100) / 100;
	}

	function emptySkills() {
		return { knowledge: 0, fitness: 0, social: 0, awareness: 0 };
	}

	function defaultSchedule() {
		return Array(config.slotsPerDay).fill("rest");
	}

	function normalizeSchedule(schedule) {
		const normalized = Array.isArray(schedule) ? schedule.slice(0, config.slotsPerDay) : [];
		while (normalized.length < config.slotsPerDay) normalized.push("rest");
		return normalized.map(activity => (config.activities[activity] ? activity : "rest"));
	}

	function createTraining() {
		return {
			dataVersion,
			skills: emptySkills(),
			activeSchedule: defaultSchedule(),
			repeatSchedule: defaultSchedule(),
			plannedDay: null,
			plannedSchedule: null,
			lastProcessedDay: getSettlementDay(),
			lastResult: null,
		};
	}

	function normalizeTraining(training) {
		if (!training || typeof training !== "object" || Array.isArray(training)) return createTraining();
		training.dataVersion = dataVersion;
		if (!training.skills || typeof training.skills !== "object" || Array.isArray(training.skills)) training.skills = emptySkills();
		Object.keys(skillLabels).forEach(skill => {
			training.skills[skill] = roundSkill(training.skills[skill]);
		});
		training.activeSchedule = normalizeSchedule(training.activeSchedule);
		/* repeatSchedule is the persistent source of truth. Version 1 only had activeSchedule. */
		training.repeatSchedule = normalizeSchedule(training.repeatSchedule || training.activeSchedule);
		if (training.plannedSchedule) training.plannedSchedule = normalizeSchedule(training.plannedSchedule);
		if (!Number.isFinite(training.plannedDay)) {
			training.plannedDay = null;
			training.plannedSchedule = null;
		}
		if (!Number.isFinite(training.lastProcessedDay)) training.lastProcessedDay = getSettlementDay();
		return training;
	}

	function isEligible(record, child) {
		return (
			isSupportedResident(record, child) &&
			eligibleStages.includes(record.lifeStage)
		);
	}

	function isSupportedResident(record, child) {
		return (
			Boolean(record && child) &&
			child.location === "eden_home" &&
			isSupportedSpecies(record) &&
			window.EdenAge?.isHumanoid(record, child) === true
		);
	}

	function isSupportedSpecies(record) {
		return Boolean(record && window.EdenAge?.isCultivableSpecies(record));
	}

	function getAvailableActivities(stage) {
		const currentOrder = stageOrder[stage] ?? -1;
		return Object.entries(config.activities)
			.filter(([, activity]) => currentOrder >= stageOrder[activity.minimumStage])
			.map(([id, activity]) => ({
				id,
				label: activity.cost > 0 ? `${activity.label}（每项 £${activity.cost / 100}）` : activity.label,
				cost: activity.cost,
			}));
	}

	function getActivityOptions(stage) {
		return Object.fromEntries(getAvailableActivities(stage).map(activity => [activity.label, activity.id]));
	}

	function sanitizePlanForStage(schedule, stage) {
		return normalizeSchedule(schedule).map(activity => (isActivityAvailable(activity, stage) ? activity : "rest"));
	}

	function isActivityAvailable(activityId, stage) {
		const activity = config.activities[activityId];
		return Boolean(activity && (stageOrder[stage] ?? -1) >= stageOrder[activity.minimumStage]);
	}

	function getTimeScale(record, settings) {
		const maturityDays = Number(settings?.maturityDays) || config.referenceMaturityDays;
		const speciesFactor = window.EdenAge?.species?.[record?.species]?.factor || 1;
		return config.referenceMaturityDays / (maturityDays * speciesFactor);
	}

	function aptitudeFor(skill, innate) {
		let attribute;
		switch (skill) {
			case "knowledge":
				attribute = innate?.intelligence;
				break;
			case "fitness":
				attribute = innate?.fitness;
				break;
			case "social":
				attribute = innate?.appearance;
				break;
			case "awareness":
				attribute = ((Number(innate?.intelligence) || 0) + (Number(innate?.appearance) || 0)) / 2;
				break;
			default:
				attribute = 50;
		}
		return config.aptitudeBase + Math.min(100, Math.max(1, Number(attribute) || 1)) / config.aptitudeDivisor;
	}

	function personalityMultiplier(skill, innate) {
		const personality = innate?.personality === "active" ? "active" : "quiet";
		return config.personalityMultipliers[personality][skill] || 1;
	}

	function diminishingMultiplier(currentValue) {
		return 1 - Math.min(100, Math.max(0, Number(currentValue) || 0)) / config.diminishingDivisor;
	}

	function spendActivityCost(cost, result, vars = getVariables()) {
		const pennies = Math.max(0, Math.floor(Number(cost) || 0));
		if (pennies === 0) return true;
		if ((Number(vars.money) || 0) < pennies) return false;
		if (typeof window.statChange?.money === "function") window.statChange.money(-pennies, "edenChildEducation");
		else vars.money -= pennies;
		result.spent += pennies;
		return true;
	}

	function applyActivity(training, record, activityId, stage, settings, changes, result) {
		const selectedId = isActivityAvailable(activityId, stage) ? activityId : "rest";
		const activity = config.activities[selectedId];
		if (!spendActivityCost(activity.cost, result)) {
			result.failedActivities.push({ id: selectedId, label: activity.label, cost: activity.cost });
			return "rest";
		}
		const timeScale = getTimeScale(record, settings);
		Object.entries(activity.effects).forEach(([skill, baseValue]) => {
			const before = training.skills[skill];
			let delta;
			if (baseValue < 0) {
				delta = baseValue * timeScale;
			} else {
				delta =
					baseValue *
					timeScale *
					aptitudeFor(skill, record.innate) *
					personalityMultiplier(skill, record.innate) *
					diminishingMultiplier(before);
			}
			training.skills[skill] = roundSkill(before + delta);
			changes[skill] += training.skills[skill] - before;
		});
		return selectedId;
	}

	function stageForDay(record, day) {
		const currentDay = getCurrentDay();
		const daysAgo = Number.isFinite(currentDay) ? Math.max(0, currentDay - day) : 0;
		const ageOnDay = Math.max(0, (Number(record.ageDays) || 0) - daysAgo);
		if (!record.stageThresholds || !window.EdenAge) return record.lifeStage;
		return window.EdenAge.getStage(ageOnDay, record.stageThresholds, getVariables().eden?.settings?.neverAutoAdult === true);
	}

	function applyDay(training, record, day, schedule, settings) {
		const stage = stageForDay(record, day);
		const changes = emptySkills();
		const result = { day, stage, schedule: defaultSchedule(), changes, spent: 0, failedActivities: [] };
		if (!eligibleStages.includes(stage)) return result;

		const timeScale = getTimeScale(record, settings);
		const passiveAwareness = (config.passiveAwareness[stage] || 0) * timeScale;
		const awarenessBefore = training.skills.awareness;
		training.skills.awareness = roundSkill(awarenessBefore + passiveAwareness);
		changes.awareness += training.skills.awareness - awarenessBefore;

		const executedSchedule = normalizeSchedule(schedule).map(activityId =>
			applyActivity(training, record, activityId, stage, settings, changes, result)
		);
		Object.keys(changes).forEach(skill => (changes[skill] = Math.round(changes[skill] * 100) / 100));
		result.schedule = executedSchedule;
		return result;
	}

	function processTraining(record, child, settings) {
		const training = normalizeTraining(record.training);
		record.training = training;
		const settlementDay = getSettlementDay();
		if (!Number.isFinite(settlementDay)) return training;

		if (!isSupportedResident(record, child)) {
			training.lastProcessedDay = settlementDay;
			return training;
		}

		for (let day = training.lastProcessedDay + 1; day <= settlementDay; day++) {
			const waitingForFuturePlan = Number.isFinite(training.plannedDay) && day < training.plannedDay;
			let schedule = waitingForFuturePlan ? training.activeSchedule : training.repeatSchedule;
			if (training.plannedDay === day && training.plannedSchedule) {
				schedule = training.plannedSchedule;
				training.repeatSchedule = normalizeSchedule(training.plannedSchedule);
			}
			training.activeSchedule = normalizeSchedule(schedule);
			training.lastResult = applyDay(training, record, day, schedule, settings);
			training.lastProcessedDay = day;
			if (Number.isFinite(training.plannedDay) && day >= training.plannedDay) {
				training.plannedDay = null;
				training.plannedSchedule = null;
			}
		}
		return training;
	}

	function syncRecord(record, child, settings) {
		if (!record || !child) return null;
		if (!record.training || record.training.dataVersion !== dataVersion) record.training = normalizeTraining(record.training);
		return processTraining(record, child, settings);
	}

	function syncAll(eden, children) {
		if (!eden?.children || !children) return;
		Object.entries(eden.children).forEach(([childId, record]) => {
			syncRecord(record, children[childId], eden.settings);
		});
	}

	function getPlanForDay(training, day = getPlanningDay()) {
		const normalized = normalizeTraining(training);
		if (normalized.plannedDay === day && normalized.plannedSchedule) return [...normalized.plannedSchedule];
		return [...normalized.repeatSchedule];
	}

	function setPlan(record, child, schedule, variables = getVariables()) {
		if (!record || !child || !isEligible(record, child)) return { ok: false, message: "这个孩子目前不能参加养成。" };
		const day = getPlanningDay();
		if (!Number.isFinite(day)) return { ok: false, message: "无法读取当前日期。" };
		const normalized = normalizeSchedule(schedule);
		if (normalized.some(activity => !isActivityAvailable(activity, record.lifeStage))) {
			return { ok: false, message: "计划中包含尚未解锁的活动。" };
		}
		const training = normalizeTraining(record.training);
		record.training = training;
		/* Save the repeating plan immediately so sleeping or a skipped settlement cannot erase it. */
		training.repeatSchedule = [...normalized];
		training.plannedDay = day;
		training.plannedSchedule = normalized;
		const timing = getCurrentHour() < config.settlementHour ? "今天" : "明天";
		return { ok: true, day, message: `已保存${timing}的三项活动。` };
	}

	function displayValue(value) {
		return Math.round(Number(value) || 0);
	}

	window.EdenTraining = Object.freeze({
		dataVersion,
		config,
		eligibleSpecies,
		eligibleStages,
		skillLabels,
		getSettlementDay,
		getPlanningDay,
		normalizeSchedule,
		normalizeTraining,
		isEligible,
		isSupportedResident,
		isSupportedSpecies,
		getAvailableActivities,
		getActivityOptions,
		sanitizePlanForStage,
		getTimeScale,
		aptitudeFor,
		personalityMultiplier,
		diminishingMultiplier,
		spendActivityCost,
		applyDay,
		processTraining,
		syncRecord,
		syncAll,
		getPlanForDay,
		setPlan,
		displayValue,
	});
})();
