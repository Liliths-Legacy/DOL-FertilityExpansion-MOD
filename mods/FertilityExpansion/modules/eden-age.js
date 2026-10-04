(() => {
	"use strict";

	const millisecondsPerDay = 24 * 60 * 60 * 1000;
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const species = Object.freeze({
		bird: Object.freeze({ label: "鸟", factor: 0.75 }),
		cat: Object.freeze({ label: "猫", factor: 0.9 }),
		fox: Object.freeze({ label: "狐狸", factor: 1 }),
		wolf: Object.freeze({ label: "狼", factor: 1.1 }),
		cow: Object.freeze({ label: "牛", factor: 1.25 }),
		other: Object.freeze({ label: "其他", factor: 1 }),
		human: Object.freeze({ label: "人类", factor: 1 }),
	});
	const stageLabels = Object.freeze({
		infant: "婴儿期",
		toddler: "幼儿期",
		child: "少儿期",
		adolescent: "少年期",
		adult: "成年",
	});
	const bodyFormLabels = Object.freeze({
		humanoid: "人形",
		beast: "动物",
	});

	function normalizeSettings(settings) {
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) return;
		const maturityDays = Number(settings.maturityDays);
		settings.maturityDays = Number.isFinite(maturityDays) ? Math.max(30, Math.floor(maturityDays)) : 90;
		settings.neverAutoAdult = settings.neverAutoAdult === true;
		settings.resetAgeOnTransfer = settings.resetAgeOnTransfer === true;
		settings.allowHumanDescendants = settings.allowHumanDescendants === true;
		settings.lifeStoryPrompt = typeof settings.lifeStoryPrompt === "string" ? settings.lifeStoryPrompt : "";
		settings.immediateLifeStory = settings.immediateLifeStory === true;
		settings.allowSterilePregnancy = settings.allowSterilePregnancy === true;
	}

	function inferSpecies(child, storedSpecies) {
		const transformation = child?.features?.beastTransform;
		if (["bird", "cat", "fox", "wolf", "cow"].includes(transformation)) return transformation;
		if (typeof transformation === "string" && transformation.trim()) return "other";
		const type = window.EdenChildData?.typeOf(child) ?? child?.type;
		if (["hawk", "harpy"].includes(type)) return "bird";
		if (["wolf", "wolfboy", "wolfgirl"].includes(type)) return "wolf";
		if (species[storedSpecies]) return storedSpecies;
		return "human";
	}

	function inferBodyForm(child) {
		const type = String(window.EdenChildData?.typeOf(child) ?? child?.type ?? "human");
		if (type === "human" || type.includes("human")) return "humanoid";
		if (["wolfboy", "wolfgirl", "harpy"].includes(type)) return "humanoid";
		if (["wolf", "hawk"].includes(type)) return child?.features?.monster === "monster" ? "humanoid" : "beast";
		return "humanoid";
	}

	function isHumanoid(record, child) {
		const bodyForm = child ? inferBodyForm(child) : record?.bodyForm;
		return bodyForm !== "beast";
	}

	function allowsHumanDescendants(settings) {
		const variables = window.SugarCube?.State?.variables;
		const activeSettings = settings || variables?.options?.eden || variables?.eden?.settings;
		return activeSettings?.allowHumanDescendants === true;
	}

	function isCultivableSpecies(record, settings) {
		if (!record) return false;
		if (["bird", "cat", "fox", "wolf", "cow", "other"].includes(record.species)) return true;
		return record.species === "human" && allowsHumanDescendants(settings);
	}

	function serialDay(date) {
		if (!date) return null;
		const monthIndex = monthNames.indexOf(date.month);
		const day = Number(date.day);
		const year = Number(date.year);
		if (monthIndex < 0 || !Number.isInteger(day) || !Number.isInteger(year)) return null;
		return Math.floor(Date.UTC(year, monthIndex, day) / millisecondsPerDay);
	}

	function currentSerialDay() {
		if (window.EdenChildData) return window.EdenChildData.currentSerialDay();
		const time = window.Time;
		if (!time) return null;
		const current = Math.floor(Date.UTC(time.year, time.month - 1, time.monthDay) / millisecondsPerDay);
		return Number.isFinite(current) ? current : null;
	}

	function getAgeDays(child, record) {
		if (window.EdenChildData) return window.EdenChildData.ageDays(child, record);
		const born = serialDay(child?.born);
		const current = currentSerialDay();
		if (current === null) return 0;
		const resetDay = record?.growthStartSerialDay;
		const start = Number.isFinite(resetDay) ? resetDay : born;
		if (start === null) return 0;
		return Math.max(0, current - start);
	}

	function resetGrowthAge(record) {
		if (!record) return false;
		const current = currentSerialDay();
		if (current === null) return false;
		record.growthStartSerialDay = current;
		record.ageResetAtTransfer = true;
		return true;
	}

	function getThresholds(speciesKey, settings) {
		normalizeSettings(settings);
		const definition = species[speciesKey] || species.human;
		/* Avoid values such as 90 * 1.1 becoming 99.00000000000001 before Math.ceil. */
		const rawMaturity = Number((settings.maturityDays * definition.factor).toFixed(10));
		return {
			toddler: Math.ceil(rawMaturity * 0.1),
			child: Math.ceil(rawMaturity * 0.3),
			adolescent: Math.ceil(rawMaturity * 0.6),
			adult: Math.ceil(rawMaturity),
		};
	}

	function getStage(ageDays, thresholds, neverAutoAdult) {
		if (ageDays < thresholds.toddler) return "infant";
		if (ageDays < thresholds.child) return "toddler";
		if (ageDays < thresholds.adolescent) return "child";
		if (neverAutoAdult || ageDays < thresholds.adult) return "adolescent";
		return "adult";
	}

	function syncRecord(record, child, settings) {
		if (!record || !child) return null;
		normalizeSettings(settings);
		const speciesKey = inferSpecies(child, record.species);
		const bodyForm = inferBodyForm(child);
		const ageDays = getAgeDays(child, record);
		const thresholds = getThresholds(speciesKey, settings);
		const lifeStage = getStage(ageDays, thresholds, settings.neverAutoAdult);

		record.species = speciesKey;
		record.speciesLabel = species[speciesKey].label;
		record.bodyForm = bodyForm;
		record.bodyFormLabel = bodyFormLabels[bodyForm];
		record.developmentTrack = bodyForm === "beast" ? "animal" : "humanoid";
		record.ageDays = ageDays;
		record.lifeStage = lifeStage;
		record.lifeStageLabel = stageLabels[lifeStage];
		record.stageThresholds = thresholds;
		record.ageDataVersion = 2;
		return record;
	}

	function syncAll(eden, children) {
		if (!eden?.children || !children) return;
		normalizeSettings(eden.settings);
		Object.entries(eden.children).forEach(([childId, record]) => {
			syncRecord(record, children[childId], eden.settings);
		});
	}

	window.EdenAge = Object.freeze({
		species,
		stageLabels,
		bodyFormLabels,
		normalizeSettings,
		inferSpecies,
		inferBodyForm,
		isHumanoid,
		allowsHumanDescendants,
		isCultivableSpecies,
		currentSerialDay,
		getAgeDays,
		resetGrowthAge,
		getThresholds,
		getStage,
		syncRecord,
		syncAll,
	});
})();
