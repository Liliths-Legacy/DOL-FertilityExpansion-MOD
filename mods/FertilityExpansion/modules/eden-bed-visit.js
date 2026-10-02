(() => {
	"use strict";

	const config = Object.freeze({
		minimumAffection: 80,
		maximumAwareness: 40,
		hourlyChance: 0.1,
		cooldownDays: 3,
	});

	function currentDay() {
		return Number(window.Time?.days) || 0;
	}

	function normalizeState(eden) {
		if (!eden || typeof eden !== "object") return null;
		if (!eden.bedVisit || typeof eden.bedVisit !== "object" || Array.isArray(eden.bedVisit)) {
			eden.bedVisit = { dataVersion: 2, lastTriggeredDay: null, activeChildId: null, variant: null, interruptedSleep: false };
		}
		const state = eden.bedVisit;
		state.dataVersion = 2;
		if (!Number.isFinite(state.lastTriggeredDay)) state.lastTriggeredDay = null;
		if (!["A", "B"].includes(state.variant)) state.variant = null;
		if (state.activeChildId === undefined) state.activeChildId = null;
		if (typeof state.interruptedSleep !== "boolean") state.interruptedSleep = false;
		return state;
	}

	function normalizeEncounterContext(eden) {
		if (!eden || typeof eden !== "object") return null;
		if (!eden.encounterContext || typeof eden.encounterContext !== "object" || Array.isArray(eden.encounterContext)) {
			eden.encounterContext = { source: null, variant: null, oralTarget: null };
		}
		const context = eden.encounterContext;
		if (context.source !== "bedVisit") context.source = null;
		if (!["A", "B"].includes(context.variant)) context.variant = null;
		if (!["penis", "vagina"].includes(context.oralTarget)) context.oralTarget = null;
		return context;
	}

	function awarenessOf(record) {
		return Number(record?.training?.skills?.awareness) || 0;
	}

	function isEligible(record, child) {
		return Boolean(
			record && child &&
			record.lifeStage === "adult" &&
			record.bodyForm !== "beast" &&
			record.adult?.settled &&
			record.adult.destination === "town" &&
			record.adult.contactStatus === "active" &&
			record.adult.bedVisitAllowed !== false &&
			(Number(record.affection) || 0) >= config.minimumAffection &&
			awarenessOf(record) <= config.maximumAwareness
		);
	}

	function eligibleIds(eden, children) {
		return Object.keys(eden?.children || {}).filter(childId => isEligible(eden.children[childId], children?.[childId]));
	}

	function select(eden, children, random = Math.random) {
		const state = normalizeState(eden);
		if (!state) return null;
		if (state.lastTriggeredDay !== null && currentDay() - state.lastTriggeredDay < config.cooldownDays) return null;
		const ids = eligibleIds(eden, children);
		if (!ids.length) return null;
		const childId = ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
		state.lastTriggeredDay = currentDay();
		state.activeChildId = childId;
		state.variant = random() < 0.5 ? "A" : "B";
		return { childId, variant: state.variant };
	}

	function trySleepInterrupt(eden, children, sleptHours, random = Math.random) {
		const state = normalizeState(eden);
		if (!state || Number(sleptHours) < 1) return null;
		if (state.lastTriggeredDay !== null && currentDay() - state.lastTriggeredDay < config.cooldownDays) return null;
		if (random() >= config.hourlyChance) return null;
		const result = select(eden, children, random);
		if (result) state.interruptedSleep = true;
		return result;
	}

	function current(eden, children) {
		const state = normalizeState(eden);
		const childId = state?.activeChildId;
		if (!childId || !eden.children?.[childId] || !children?.[childId]) return null;
		return { childId, variant: state.variant || "A", record: eden.children[childId], child: children[childId] };
	}

	function clear(eden) {
		const state = normalizeState(eden);
		if (!state) return;
		state.activeChildId = null;
		state.variant = null;
	}

	function forbid(record) {
		if (!record?.adult) return false;
		record.adult.bedVisitAllowed = false;
		return true;
	}

	function restore(record) {
		if (!record?.adult) return false;
		record.adult.bedVisitAllowed = true;
		return true;
	}

	function hasPenis(child) {
		if (child?.penis !== undefined) return child.penis !== "none" && child.penis !== false;
		return ["m", "h"].includes(child?.gender);
	}

	function hasVagina(child) {
		if (child?.vagina !== undefined) return child.vagina !== "none" && child.vagina !== false;
		return ["f", "h"].includes(child?.gender);
	}

	function prepareEncounter(eden, variant, player, binaryRoll = 0) {
		const context = normalizeEncounterContext(eden);
		if (!context) return null;
		context.source = "bedVisit";
		context.variant = ["A", "B"].includes(variant) ? variant : "A";
		context.oralTarget = null;
		if (context.variant === "A") {
			const playerHasPenis = Boolean(player?.penisExist);
			const playerHasVagina = Boolean(player?.vaginaExist);
			if (playerHasPenis && playerHasVagina) context.oralTarget = Number(binaryRoll) === 1 ? "penis" : "vagina";
			else if (playerHasPenis) context.oralTarget = "penis";
			else if (playerHasVagina) context.oralTarget = "vagina";
		}
		return context;
	}

	function clearEncounterContext(eden) {
		const context = normalizeEncounterContext(eden);
		if (!context) return;
		context.source = null;
		context.variant = null;
		context.oralTarget = null;
	}

	function resolveCombatStart(context, player, npc) {
		if (context?.source !== "bedVisit" || !["A", "B"].includes(context.variant)) return "none";
		const playerHasPenis = Boolean(player?.penisExist);
		const playerHasVagina = Boolean(player?.vaginaExist);
		const childHasPenis = hasPenis(npc);
		const childHasVagina = hasVagina(npc);
		if (context.variant === "A") {
			if (context.oralTarget === "penis" && playerHasPenis) return "childOralPlayerPenis";
			if (context.oralTarget === "vagina" && playerHasVagina) return "childOralPlayerVagina";
			if (playerHasPenis) return "childOralPlayerPenis";
			if (playerHasVagina) return "childOralPlayerVagina";
			return "none";
		}
		if (childHasPenis && playerHasVagina) return "childPenisPlayerVagina";
		if (childHasPenis) return "childPenisPlayerAnus";
		if (playerHasPenis && childHasVagina) return "playerPenisChildVagina";
		if (playerHasPenis) return "playerPenisChildAnus";
		if (playerHasVagina && childHasVagina) return "trib";
		return "none";
	}

	window.EdenBedVisit = Object.freeze({
		config, normalizeState, normalizeEncounterContext, isEligible, eligibleIds, select, trySleepInterrupt, current, clear,
		forbid, restore, hasPenis, hasVagina, prepareEncounter, clearEncounterContext, resolveCombatStart,
	});
})();
