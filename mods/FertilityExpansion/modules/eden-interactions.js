(() => {
	"use strict";

	const dataVersion = 2;
	const eligibleSpecies = Object.freeze(["bird", "cat", "fox", "wolf", "cow", "other"]);
	const config = Object.freeze({
		referenceMaturityDays: 90,
		refreshHours: 4,
		defaultCategory: "care",
		gains: Object.freeze({
			companionship: 0.2,
			care: 0.35,
			play: 0.45,
			comfort: 0.6,
		}),
		eventCategories: Object.freeze({
			companionship: Object.freeze([
				"transfixed", "stroke", "yawn", "murmur", "cotNap", "shiverInCot",
				"sleepingStroke", "cuddleAndNap", "sleepingStrokeHawk", "cuddleAndNapHawk", "Robin", "Wraith",
				"toddlerGarden", "childQuietCompany", "adolescentWalk", "adolescentSpace", "adultTea", "adultWalk", "adultQuietCompany",
			]),
			care: Object.freeze([
				"nappyChange", "batheGentle", "batheShampoo", "BatheCalm", "batheTantrum",
				"preen", "bathe", "batheHelp", "preeningToy", "toddlerMess", "childChores", "adolescentCook", "adultMeal",
			]),
			play: Object.freeze([
				"waveTongue", "handsClap", "peekaboo", "blowRaspberriesHappy", "blowRaspberriesUpset", "faceStudy",
				"smilesAndLaughs", "talking", "talking2", "crawlingAttempt", "crawlingAttempt2", "grumpyChild",
				"readingAttempt", "babyRattle", "teddyBear", "toyCar", "clown", "playing", "curiousGaze",
				"fieldTrip", "grumpyWolf", "gnawing", "squeakyToy", "squeakyToy2", "chewBone", "chewBone2",
				"chewRope", "chewRope2", "rollBall", "rollBall2", "pickUpHawk", "pretendFly", "perch", "swingToy",
				"toddlerPictureBook", "toddlerBlocks", "childHomework", "childReading", "childOutdoorGame", "childQuestions",
				"adolescentHobby", "adolescentFuture", "adultHobby",
			]),
			comfort: Object.freeze([
				"restlessSleep", "rockToSleep", "holdToShoulder", "melodicLullaby", "foreheadKiss", "objectShow",
				"carryRevolt", "nurseryRhymes", "FeetCup", "shareThoughts", "speakCry", "dummy", "cryingWolf",
				"hungryWolf", "cryingHawk", "toddlerCuddle", "toddlerTantrum", "childWorry", "adolescentSchoolTrouble", "adultTroubles",
			]),
		}),
		stagePools: Object.freeze({
			toddler: Object.freeze([
				"toddlerCuddle", "toddlerPictureBook", "toddlerBlocks", "toddlerMess", "toddlerGarden", "toddlerTantrum",
			]),
			child: Object.freeze([
				"childHomework", "childReading", "childOutdoorGame", "childChores", "childWorry", "childQuestions", "childQuietCompany",
			]),
			adolescent: Object.freeze([
				"adolescentFuture", "adolescentSchoolTrouble", "adolescentWalk", "adolescentCook", "adolescentHobby", "adolescentSpace",
			]),
			adult: Object.freeze([
				"adultTea", "adultMeal", "adultWalk", "adultTroubles", "adultHobby", "adultQuietCompany",
			]),
		}),
	});

	function ensureBonding(record) {
		if (!record.bonding || typeof record.bonding !== "object" || Array.isArray(record.bonding)) {
			record.bonding = { dataVersion, totalInteractions: 0, totalAffectionGained: 0, lastInteraction: null, currentActivity: null };
		}
		record.bonding.dataVersion = dataVersion;
		return record.bonding;
	}

	function isSupportedSpecies(record) {
		return Boolean(record && window.EdenAge?.isCultivableSpecies(record));
	}

	function usesStagePool(eden, children, childId) {
		const id = String(childId || "");
		const record = eden?.children?.[id];
		const child = children?.[id];
		return Boolean(
			record &&
			child &&
			child.location === "eden_home" &&
			isSupportedSpecies(record) &&
			window.EdenAge?.isHumanoid(record, child) === true &&
			config.stagePools[record.lifeStage]
		);
	}

	function randomItem(items) {
		if (!items?.length) return null;
		const index = typeof window.random === "function" ? window.random(0, items.length - 1) : Math.floor(Math.random() * items.length);
		return items[index];
	}

	function prepareStageActivity(eden, children, childId) {
		if (!usesStagePool(eden, children, childId)) return null;
		const id = String(childId);
		const record = eden.children[id];
		const bonding = ensureBonding(record);
		const day = Number(window.Time?.days) || 0;
		const hour = Number(window.Time?.hour) || 0;
		const current = bonding.currentActivity;
		const elapsed = current ? Math.max(0, day * 24 + hour - (Number(current.day) * 24 + Number(current.hour))) : Infinity;
		const shouldRefresh =
			!current || current.stage !== record.lifeStage || elapsed >= config.refreshHours || (hour === 7 && elapsed >= 2);
		if (shouldRefresh) {
			bonding.currentActivity = {
				id: randomItem(config.stagePools[record.lifeStage]),
				stage: record.lifeStage,
				day,
				hour,
				completed: false,
			};
		}
		return bonding.currentActivity;
	}

	function createStageEvent(eden, childId, activityId, minutes) {
		const id = String(childId || "");
		const record = eden?.children?.[id];
		const activity = record ? ensureBonding(record).currentActivity : null;
		if (!activity || activity.id !== activityId || activity.completed) return null;
		return { childId: id, eventId: activityId, minutes: Number(minutes) || 0, completed: false };
	}

	function completeStageInteraction(eden, children, event) {
		if (!event || event.completed) return { ok: false, gain: 0 };
		event.completed = true;
		const record = eden?.children?.[String(event.childId)];
		const activity = record ? ensureBonding(record).currentActivity : null;
		if (activity?.id === event.eventId) activity.completed = true;
		return recordInteraction(eden, children, event.childId, event.eventId);
	}

	function categoryFor(eventId) {
		return Object.entries(config.eventCategories).find(([, events]) => events.includes(eventId))?.[0] || config.defaultCategory;
	}

	function timeScale(record, settings) {
		const sharedScale = window.EdenTraining?.getTimeScale?.(record, settings);
		if (Number.isFinite(sharedScale) && sharedScale > 0) return sharedScale;
		const maturityDays = Math.max(30, Number(settings?.maturityDays) || config.referenceMaturityDays);
		const speciesFactor = window.EdenAge?.species?.[record?.species]?.factor || 1;
		return config.referenceMaturityDays / (maturityDays * speciesFactor);
	}

	function recordInteraction(eden, children, childId, eventId) {
		const id = String(childId || "");
		const record = eden?.children?.[id];
		const child = children?.[id];
		if (!record || !child || !isSupportedSpecies(record)) return { ok: false, gain: 0 };
		const category = categoryFor(eventId);
		const baseGain = config.gains[category] || config.gains[config.defaultCategory];
		const scale = timeScale(record, eden.settings);
		let gain = 0;
		if (record.lifeStage !== "adult") {
			if (typeof window.EdenAdult?.applyAffection !== "function") return { ok: false, gain: 0 };
			window.EdenAdult.ensureAffection(record, child, window.EdenAdult.config.affection.newResident);
			const roomMultiplier = window.EdenUpgrades?.affectionMultiplier(eden, child) || 1;
			gain = window.EdenAdult.applyAffection(record, baseGain * scale * roomMultiplier);
		}
		const bonding = ensureBonding(record);
		bonding.totalInteractions = (Number(bonding.totalInteractions) || 0) + 1;
		bonding.totalAffectionGained = Math.round(((Number(bonding.totalAffectionGained) || 0) + gain) * 100) / 100;
		bonding.lastInteraction = {
			eventId: String(eventId || "unknown"),
			category,
			gain,
			day: Number(window.Time?.days) || 0,
		};
		return { ok: true, eventId, category, baseGain, scale, gain };
	}

	window.EdenInteractions = Object.freeze({
		dataVersion,
		eligibleSpecies,
		config,
		ensureBonding,
		isSupportedSpecies,
		usesStagePool,
		prepareStageActivity,
		createStageEvent,
		completeStageInteraction,
		categoryFor,
		timeScale,
		recordInteraction,
	});
})();
