const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

// Small DOM fixture exercising injected controls and event dispatch, without loading a game/save.
class Node {
	constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.classes = new Set(); this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), contains: x => this.classes.has(x) }; this.isConnected = true; this.value = ""; }
	appendChild(node) { this.children.push(node); node.parent = this; if (this.tagName === "select" && this.children.length === 1) Object.defineProperty(this, "value", { configurable: true, get: () => this.chosen ?? node.value, set: value => { this.chosen = value; } }); return node; }
	replaceChildren() { this.children.forEach(n => n.isConnected = false); this.children = []; }
	setAttribute(k, v) { this.attrs[k] = v; }
	addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
	remove() { this.parent.children = this.parent.children.filter(n => n !== this); this.isConnected = false; }
	closest(selector) { return (selector === "button" && this.tagName === "button") || (selector === ".hidden" && this.classList.contains("hidden")) ? this : this.parent?.closest(selector); }
	querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
	querySelectorAll(selector) {
		if (selector === ":scope > button") return this.children.filter(n => n.tagName === "button");
		return this.all().filter(n => selector.startsWith("#") ? n.id === selector.slice(1) : selector.startsWith("[") ? Object.hasOwn(n.attrs, selector.slice(1, -1)) : n.tagName === selector);
	}
	all() { return this.children.flatMap(n => [n, ...n.all()]); }
	click() { if (this.disabled) return; for (const fn of this.parent?.listeners.click || []) fn({ target: this }); for (const fn of this.listeners.click || []) fn({ target: this }); }
	matches() { return false; }
}
function fixture({ enabled = true, kind = "cheats", settled = false, hidden = false, capacity = 3 } = {}) {
	const overlay = new Node("div"); overlay.dataset.overlay = kind;
	if (hidden) overlay.classList.add("hidden");
	const tabs = overlay.appendChild(new Node("div")); tabs.id = "overlayTabs";
	const native = tabs.appendChild(new Node("button")); native.textContent = "原版";
	const wrapper = overlay.appendChild(new Node("div")); wrapper.id = "customOverlayContent";
	const container = wrapper.appendChild(new Node("div")); container.id = "cheatsShown";
	const doc = { body: overlay, getElementById: id => id === "customOverlay" ? overlay : overlay.querySelector("#" + id), createElement: tag => new Node(tag) };
	const calls = [], tips = [], timers = new Map(); let nextTimer = 0;
	const child = { name: "<不解析的名字>" }, record = { innate: { appearance: 50, fitness: 50, intelligence: 50, temperament: 50 }, training: { skills: { knowledge: 12, fitness: 0, social: 0, awareness: 0 } } };
	const v = { cheatsEnabled: enabled, eden: { children: { 0: record } } };
	v.eden.facility = { owned: true, capacity };
	record.adult = { settled };
	child.location = settled ? "eden_contacts" : "eden_home";
	const childData = { 0: child };
	const $ = node => ({ on() {}, tooltip: arg => { tips.push({ node, arg }); } }); $.fn = { tooltip() {} };
	const fields = { species: "human", gender: "f", monster: "", beastTransform: "fox", divineTransform: "", size: "normal", hairColour: "brown", eyeColour: "green", skinColour: "light" };
	const window = { SugarCube: { State: { variables: v } }, Wikifier: function() {},
		EdenChildData: { get: id => childData[id], entries: () => Object.entries(childData), phaseOf: () => "born", locationOf: child => child.location },
		EdenFacility: { residentIds: () => Object.keys(childData).filter(id => childData[id].location === "eden_home") },
		EdenTraining: { skillLabels: { knowledge: "学识", fitness: "体能", social: "社交", awareness: "意识" } },
		EdenCheats: { available: () => v.cheatsEnabled, children: () => [["0", child]], choices: () => Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, [value]])), identity: () => fields,
			resetReason: () => "", reset: id => { calls.push(["reset", id]); return { ok: true, message: "重置成功" }; },
			adultReason: () => "", settleAdult: id => { calls.push(["adult", id]); return { ok: true, message: "已结算" }; },
			removeChild: id => { calls.push(["delete", id]); delete childData[id]; delete v.eden.children[id]; return { ok: true, message: "已删除" }; },
			saveInnate: (id, patch) => { calls.push(["innate", id, patch]); return { ok: true, message: "保存成功" }; },
			saveSkills: (id, patch) => { calls.push(["skills", id, patch]); return { ok: true, message: "保存成功" }; },
			labour: () => { calls.push(["labour"]); return { ok: true, message: "足月" }; },
			parasites: flag => { calls.push(["parasites", flag]); return { ok: true, message: "成功" }; },
		} };
	const context = vm.createContext({
		window, document: doc, $, MutationObserver: class { observe() {} }, setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
	});
	// Use the real access check; a stub tied to cheatsEnabled hid the Lyra bug.
	const actions = window.EdenCheats;
	vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-cheats.js"), "utf8"), context);
	window.EdenCheats = { ...actions, available: window.EdenCheats.available, children: window.EdenCheats.children, resetReason: window.EdenCheats.resetReason };
	vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-cheats-ui.js"), "utf8"), context);
	const click = label => { const node = overlay.all().find(n => n.tagName === "button" && n.textContent === label); assert.ok(node, label); node.click(); return node; };
	return { window, overlay, tabs, native, container, calls, tips, timers, v, click, childData };
}
test("entry exists only within enabled native cheats, is idempotent, and tracks tab selection", () => {
	for (const options of [{ enabled: false, hidden: true }, { kind: "options" }]) {
		const f = fixture(options); assert.equal(f.tabs.children.length, 1);
	}
	const f = fixture(); f.window.EdenCheatsUI.ensure(); f.window.EdenCheatsUI.ensure();
	assert.equal(f.tabs.children.length, 2);
	const tab = f.click("生育扩展作弊"); assert.equal(tab.classList.contains("tab-selected"), true);
	f.native.click(); assert.equal(tab.classList.contains("tab-selected"), false);
	f.v.cheatsEnabled = false; f.overlay.classList.add("hidden"); f.window.EdenCheatsUI.ensure(); assert.equal(f.tabs.children.length, 1);
});
test("Lyra's unlocked native menu shows the tab with cheatsEnabled false, including reopen", () => {
	const f = fixture({ enabled: false });
	f.click("生育扩展作弊");
	assert.equal(f.window.EdenCheats.available(), true);
	f.click("寄生卵一键受精"); assert.deepEqual(f.calls, [["parasites", true]]);
	f.overlay.classList.add("hidden"); f.window.EdenCheatsUI.ensure();
	assert.equal(f.window.EdenCheats.available(), false);
	assert.equal(f.tabs.children.length, 1);
	f.overlay.classList.remove("hidden"); f.window.EdenCheatsUI.ensure();
	f.click("生育扩展作弊");
	f.overlay.dataset.overlay = "options"; f.window.EdenCheatsUI.ensure();
	assert.equal(f.tabs.children.length, 1);
	assert.equal(f.v.cheatsEnabled, false);
});
test("controls target stable child zero, keep separate parasite actions and require reset confirmation", () => {
	const f = fixture(); f.click("生育扩展作弊");
	f.click("寄生卵一键受精"); f.click("寄生物一键成熟");
	assert.deepEqual(f.calls.slice(0, 2), [["parasites", true], ["parasites", false]]);
	f.click("保存先天属性与外貌"); assert.equal(f.calls[2][1], "0"); assert.equal(f.calls[2][2].intelligence, 50);
	f.click("重置养育进度"); assert.equal(f.calls.filter(c => c[0] === "reset").length, 0);
	f.click("取消"); assert.equal(f.calls.filter(c => c[0] === "reset").length, 0);
	f.click("重置养育进度"); f.click("确认重置"); assert.equal(f.calls.at(-1)[1], "0");
	assert.equal(f.container.all().find(n => n.tagName === "option").textContent, "<不解析的名字> · #0");
});
test("settled reset is enabled with a persistent warning; help supports touch hold", () => {
	const f = fixture({ settled: true }); f.click("生育扩展作弊");
	assert.equal(f.click("重置养育进度").disabled, false);
	assert.ok(f.container.all().some(n => n.tagName === "small" && n.className.includes("red") && n.textContent === "会清空成年之后的LLM以及孕期数据。"));
	f.click("取消");
	const help = f.container.all().find(n => n.attrs.tooltip);
	assert.ok(f.tips.some(t => t.node === help && t.arg.position === "bottom"));
	help.listeners.pointerdown[0]({ pointerType: "touch" }); assert.equal(f.timers.size, 1);
	help.listeners.pointermove[0]({ pointerType: "touch" }); assert.equal(f.timers.size, 0);
	help.listeners.pointerdown[0]({ pointerType: "touch" }); [...f.timers.values()][0]();
	assert.equal(f.tips.at(-1).arg, "show"); help.listeners.pointerup[0](); assert.equal(f.tips.at(-1).arg, "hide");
});
test("name search ranks matches, handles no results, and keeps destructive actions bound to the selected ID", () => {
	const f = fixture();
	f.childData[1] = { name: "小花" }; f.childData[2] = { name: "小花" };
	f.v.eden.children[1] = structuredClone(f.v.eden.children[0]); f.v.eden.children[2] = structuredClone(f.v.eden.children[0]);
	f.click("生育扩展作弊");
	const search = f.container.all().find(n => n.type === "search");
	const list = f.container.all().find(n => n.attrs["aria-label"] === "选择孩子");
	search.value = "小花"; search.listeners.input[0]();
	assert.deepEqual(list.children.map(n => n.value), ["1", "2"]);
	list.value = "2"; list.listeners.change[0]();
	f.click("删除孩子"); assert.equal(f.calls.length, 0);
	f.click("取消"); assert.equal(f.calls.length, 0);
	f.click("立刻成年结算"); assert.equal(f.calls.length, 0);
	f.click("确认结算"); assert.deepEqual(f.calls, [["adult", "2"]]);
	const warnings = f.container.all().filter(n => n.tagName === "small");
	assert.ok(warnings.some(n => n.className.includes("red") && n.textContent.includes("所有LLM数据")));
	assert.ok(warnings.some(n => n.textContent === "除了读取旧存档之外，该操作不可恢复"));
	f.click("删除孩子"); f.click("确认删除");
	assert.deepEqual(f.calls.at(-1), ["delete", "2"]);
	assert.deepEqual(list.children.map(n => n.value), ["1"]);
	search.value = "不存在"; search.listeners.input[0]();
	assert.equal(list.disabled, true);
	assert.ok(!f.container.all().some(n => n.textContent === "删除孩子"));
	search.value = ""; search.listeners.input[0]();
	assert.equal(list.disabled, false); assert.equal(list.children.length, 2);
});
test("invalid numeric inputs show red inline feedback without calling save, then valid input saves", () => {
	const f = fixture(); f.click("生育扩展作弊");
	const inputs = f.container.all().filter(n => n.type === "number");
	for (const [index, label] of [[0, "保存先天属性与外貌"], [4, "保存养成属性"]]) {
		const original = inputs[index].value;
		for (const value of [101, -1, "", "bad"]) {
			inputs[index].value = value; f.click(label);
			assert.equal(f.calls.length, 0);
			assert.ok(f.container.all().some(n => n.attrs.role === "status" && n.className === "red" && n.textContent === "请输入0-100之间的数字"));
		}
		inputs[index].value = original;
	}
	inputs[4].value = 100; f.click("保存养成属性"); assert.equal(f.calls[0][0], "skills");
	const species = f.container.all().find(n => n.tagName === "select" && n.parent.textContent === "基础种族");
	const monster = f.container.all().find(n => n.tagName === "select" && n.parent.textContent === "人形特征");
	assert.equal(monster.disabled, true);
	species.value = "wolf"; species.listeners.change[0](); assert.equal(monster.disabled, false);
	monster.value = "monster"; f.click("保存先天属性与外貌"); assert.equal(f.calls.at(-1)[2].monster, "monster");
});
test("a full nursery disables adult reset and explains the reason in the hover/hold tooltip", () => {
	const f = fixture({ settled: true, capacity: 0 }); f.click("生育扩展作弊");
	const reset = f.click("重置养育进度");
	assert.equal(reset.disabled, true);
	assert.ok(reset.parent.all().some(n => n.attrs.tooltip?.includes("伊甸园没有空位")));
	assert.equal(f.calls.length, 0);
	f.v.eden.facility.capacity = 1; f.click("生育扩展作弊");
	assert.equal(f.click("重置养育进度").disabled, false);
});

test("side bar failures preserve the successful action result and never escape the click handler", () => {
	const f = fixture(); f.click("生育扩展作弊");
	f.window.Wikifier = function() { throw new Error("render failed"); };
	// The currently open page captures the renderer, so reopen with a renderer failing only for sidebar.
	f.window.Wikifier = function(_, text) { if (text.includes("updatesidebarimg")) throw new Error("render failed"); };
	f.click("生育扩展作弊"); f.click("保存养成属性");
	assert.equal(f.calls.length, 1);
	assert.ok(f.container.all().some(n => n.className === "red" && n.textContent.includes("保存成功") && n.textContent.includes("操作已生效")));
});
test("loading another save blocks all old mutation buttons, including an already open confirmation", () => {
	for (const label of ["保存先天属性与外貌", "保存养成属性", "一键分娩", "寄生卵一键受精", "确认删除", "确认重置", "确认结算"]) {
		const f = fixture(); f.click("生育扩展作弊");
		const trigger = { 确认删除: "删除孩子", 确认重置: "重置养育进度", 确认结算: "立刻成年结算" }[label];
		if (trigger) f.click(trigger);
		f.window.SugarCube.State.variables = structuredClone(f.v);
		f.click(label);
		assert.equal(f.calls.length, 0, label);
		assert.ok(f.container.all().some(n => n.className === "red" && n.textContent.includes("存档已切换")), label);
	}
});
test("replacement of a child with the same ID invalidates pending confirmation", () => {
	const f = fixture(); f.click("生育扩展作弊"); f.click("删除孩子");
	f.childData[0] = { ...f.childData[0], name: "另一位" };
	f.click("确认删除"); assert.equal(f.calls.length, 0);
	assert.ok(f.container.all().some(n => n.className === "red" && n.textContent.includes("孩子数据已变化")));
});
test("missing modules and setup failures show an inline error without partial action controls", () => {
	for (const change of [f => delete f.window.EdenTraining, f => { f.window.Wikifier = function() { throw null; }; }]) {
		const f = fixture(); change(f); f.click("生育扩展作弊");
		assert.equal(f.container.querySelectorAll("button").length, 0);
		assert.ok(f.container.all().some(n => n.className === "red" && n.textContent.includes("无法打开作弊页")));
	}
});
test("search failures and successful-action refresh failures do not escape or hide the result", () => {
	const f = fixture(); f.click("生育扩展作弊");
	f.window.EdenCheats.children = () => { throw new Error("列表不可用"); };
	f.click("删除孩子"); f.click("确认删除");
	assert.equal(f.calls[0][0], "delete");
	assert.ok(f.container.all().some(n => n.textContent?.includes("已删除") && n.textContent.includes("操作已生效")));
	const search = f.container.all().find(n => n.type === "search");
	assert.doesNotThrow(() => search.listeners.input[0]());
	assert.ok(f.container.all().some(n => n.className === "red" && n.textContent.includes("列表不可用")));
});

test("broken tooltip plugins fall back to plain help without breaking rendering or long press", () => {
	const f = fixture(); f.tips.push = () => { throw new Error("tooltip unavailable"); };
	f.click("生育扩展作弊");
	const help = f.container.all().find(n => n.attrs.tooltip);
	assert.equal(help.title, help.attrs.tooltip);
	help.listeners.pointerdown[0]({ pointerType: "touch" });
	assert.doesNotThrow(() => [...f.timers.values()][0]());
	assert.doesNotThrow(() => help.listeners.pointerup[0]());
	f.click("保存养成属性"); assert.equal(f.calls.length, 1);
});
