(() => {
	"use strict";
	const labels = Object.freeze({
		knowledge: "学识", fitness: "体能", social: "社交", awareness: "意识",
		appearance: "容貌", innateFitness: "天生体能", intelligence: "天生智力",
		activeAffinity: "活泼适性", quietAffinity: "安静适性", inverseAwareness: "(100−意识)",
	});
	function ensure(eden) {
		if (!eden) return null;
		if (!eden.handbook || typeof eden.handbook !== "object" || Array.isArray(eden.handbook)) eden.handbook = {};
		for (const category of ["town", "away"]) {
			if (!eden.handbook[category] || typeof eden.handbook[category] !== "object" || Array.isArray(eden.handbook[category])) eden.handbook[category] = {};
		}
		return eden.handbook;
	}
	function syncAll(eden) {
		const state = ensure(eden);
		const config = window.EdenAdult?.config;
		if (!state || !config) return;
		for (const record of Object.values(eden.children || {})) {
			const adult = record?.adult;
			if (adult?.settled !== true) continue;
			if (adult.outcome === "work" && config.careers[adult.career]) state.town[adult.career] = true;
			if (adult.outcome === "awayWork" && config.universityCareers[adult.career]) state.away[adult.career] = true;
		}
	}
	function weightedFormula(weights, threshold) {
		return `${Object.entries(weights).map(([key, weight]) => `${labels[key] || key}×${Number(weight).toFixed(2)}`).join(" + ")} ≥ ${threshold}`;
	}
	function requirement(careerId, category) {
		const config = window.EdenAdult.config;
		const career = (category === "town" ? config.careers : config.universityCareers)[careerId];
		if (!career) return "";
		if (careerId === "survival") return "镇内其他职业判定均未通过。";
		if (careerId === "corporateEmployee") return "已通过大学判定，且镇外其他职业判定均未通过。";
		const minimums = Object.entries(career.minimums).map(([key, minimum]) => `${labels[key] || key} ≥ ${minimum}`);
		return [weightedFormula(career.weights, career.minimumScore), ...minimums].join(" 且 ");
	}
	function entries(eden, category) {
		syncAll(eden);
		const config = window.EdenAdult.config;
		const order = category === "town"
			? [...config.careerOrder.normal, ...config.careerOrder.risky, "survival"]
			: [...config.universityCareerOrder, "corporateEmployee"];
		const careers = category === "town" ? config.careers : config.universityCareers;
		return order.filter(id => eden.handbook[category][id] === true).map(id => ({ id, label: careers[id].label, requirement: requirement(id, category) }));
	}
	function universityRequirement() {
		const university = window.EdenAdult.config.university;
		return `${weightedFormula(university.weights, university.minimumScore)} 且 意识 ≥ ${university.minimumAwareness}`;
	}
	window.EdenHandbook = Object.freeze({ ensure, syncAll, entries, requirement, universityRequirement });
})();
