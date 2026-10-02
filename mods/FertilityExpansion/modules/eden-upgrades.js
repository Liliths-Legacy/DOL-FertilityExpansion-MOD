(() => {
	"use strict";
	const config = Object.freeze({
		nurseryMultiplier: 1.25,
		libraryMultiplier: 1.25,
		paintingAwareness: 1,
		items: Object.freeze({
			nursery: Object.freeze({ label: "装修育儿室", price: 1200000, description: "孩子会更加开心", category: "renovation" }),
			library: Object.freeze({ label: "装修图书室", price: 1800000, description: "让孩子看书更有效率", category: "renovation" }),
			landscape: Object.freeze({ label: "购买风景画", price: 150000, description: "可以挂在墙上。提供所有孩子的每日意识衰减。", category: "decoration" }),
			abstract: Object.freeze({ label: "购买抽象画", price: 250000, description: "可以挂在墙上。提供所有孩子的每日意识增加。", category: "decoration" }),
		}),
	});
	const bookActivities = new Set(["pictureBook", "textbook", "novel", "history"]);
	function variables() { return window.SugarCube?.State?.variables || {}; }
	function ensure(eden) {
		if (!eden?.facility) return null;
		if (!eden.facility.upgrades || typeof eden.facility.upgrades !== "object" || Array.isArray(eden.facility.upgrades)) {
			eden.facility.upgrades = { owned: {}, paintingHistory: [] };
		}
		const state = eden.facility.upgrades;
		if (!state.owned || typeof state.owned !== "object" || Array.isArray(state.owned)) state.owned = {};
		if (!Array.isArray(state.paintingHistory)) state.paintingHistory = [];
		return state;
	}
	function prepare(eden, children) {
		window.EdenTraining?.syncAll(eden, children);
		return window.EdenTraining?.getPlanningDay();
	}
	function buy(eden, children, id, vars = variables()) {
		const item = config.items[id];
		const state = ensure(eden);
		if (!eden?.facility?.owned || !state || !item) return { ok: false, message: "无法购买这个项目。" };
		if (state.owned[id]) return { ok: false, message: "你已经购买了这个项目。" };
		const day = prepare(eden, children);
		if (!Number.isFinite(day)) return { ok: false, message: "暂时无法安排送货。" };
		if ((Number(vars.money) || 0) < item.price) return { ok: false, message: "你的钱不够。" };
		if (typeof window.statChange?.money === "function") window.statChange.money(-item.price, "edenFurnishings");
		else vars.money -= item.price;
		state.owned[id] = { day };
		return { ok: true, message: item.category === "renovation" ? "你付清了费用，店家安排将材料送到伊甸园，并派人完成装修。" : "你买下了画作。店家会将它送到伊甸园，你可以回去选择挂在墙上。" };
	}
	function hanging(eden, day = Infinity) {
		const history = ensure(eden)?.paintingHistory || [];
		let painting = null;
		for (const entry of history) if (entry.day <= day) painting = entry.painting;
		return painting;
	}
	function hang(eden, children, painting) {
		const state = ensure(eden);
		if (!eden?.facility?.owned || !state) return { ok: false, message: "你还没有买下伊甸园。" };
		if (painting !== null && (!["landscape", "abstract"].includes(painting) || !state.owned[painting])) {
			return { ok: false, message: "你还没有买下这幅画。" };
		}
		const day = prepare(eden, children);
		if (!Number.isFinite(day)) return { ok: false, message: "暂时无法更换陈设。" };
		state.paintingHistory.push({ day, painting });
		return { ok: true, message: painting === null ? "你取下了墙上的画。" : `你将${painting === "landscape" ? "风景画" : "抽象画"}挂在墙上。` };
	}
	function bookMultiplier(activity, day, eden = variables().eden) {
		const purchase = ensure(eden)?.owned.library;
		return purchase && day >= purchase.day && bookActivities.has(activity) ? config.libraryMultiplier : 1;
	}
	function affectionMultiplier(eden, child) {
		return child?.location === "eden_home" && ensure(eden)?.owned.nursery ? config.nurseryMultiplier : 1;
	}
	function awarenessChange(day, eden = variables().eden) {
		const painting = hanging(eden, day);
		return painting === "landscape" ? -config.paintingAwareness : painting === "abstract" ? config.paintingAwareness : 0;
	}
	window.EdenUpgrades = Object.freeze({ config, ensure, buy, hang, hanging, bookMultiplier, affectionMultiplier, awarenessChange });
})();
