;(() => {
	"use strict";
	const attribute = "data-eden-cheats-tab";
	const vars = () => window.SugarCube?.State?.variables || window.State?.variables;
	const errorMessage = error => typeof error?.message === "string" ? error.message : typeof error === "string" ? error : "操作失败，请重新打开作弊页后重试。";
	const words = { human: "人类", wolf: "狼", hawk: "鸟", m: "男性", f: "女性", h: "双性", monster: "人形",
		bird: "鸟", cat: "猫", fox: "狐", cow: "牛", angel: "天使", fallen: "堕天使", demon: "恶魔",
		tiny: "娇小", small: "偏小", normal: "普通", large: "高大", light: "浅色", medium: "中等", dark: "深色",
		black: "黑", jetblack: "乌黑", brown: "棕", white: "白", grey: "灰", tan: "棕褐", red: "红", pink: "粉", green: "绿",
		purple: "紫", amber: "琥珀", hazel: "榛色", "dark blue": "深蓝", "light blue": "浅蓝", "lime green": "青柠绿", "light grey": "浅灰",
		softbrown: "柔棕", lightbrown: "浅棕", burntorange: "焦橙", blond: "金", softblond: "浅金", platinumblond: "铂金",
		ashyblond: "灰金", strawberryblond: "草莓金", ginger: "姜红", "dark brown": "深棕", gyaru: "辣妹", ghostlyPale: "苍白",
		ylight: "浅黄", ymedium: "中黄", ydark: "深黄", ygyaru: "黄调辣妹" };
	function element(tag, parent, text, className) {
		const el = document.createElement(tag);
		if (text !== undefined) el.textContent = text;
		if (className) el.className = className;
		parent?.appendChild(el);
		return el;
	}
	function hint(parent, message) {
		const el = element("span", parent, " (?)", "tooltip-anchor linkBlue");
		el.tabIndex = 0;
		el.setAttribute("aria-label", message);
		el.setAttribute("tooltip", message);
		el.setAttribute("tooltip-position", "bottom");
		const tooltip = command => {
			try {
				if (typeof $.fn?.tooltip === "function") $(el).tooltip(command);
				else el.title = message;
			} catch (_) { el.title = message; }
		};
		tooltip({ message, position: "bottom" });
		// Native dynamic tooltip styling; explicit touch hold avoids relying on emulated hover.
		let timer;
		const show = () => { if (el.isConnected) tooltip("show"); };
		const hide = () => { clearTimeout(timer); tooltip("hide"); };
		el.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") timer = setTimeout(show, 500); });
		for (const event of ["pointerup", "pointercancel", "pointerleave", "blur"]) el.addEventListener(event, hide);
		el.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") hide(); });
		el.addEventListener("contextmenu", e => e.preventDefault());
		el.addEventListener("focus", () => { if (el.matches(":focus-visible")) show(); });
	}
	function button(parent, text, action, explanation) {
		const b = element("button", parent, text);
		b.type = "button";
		b.addEventListener("click", () => {
			try { action(); }
			catch (error) { element("div", parent, errorMessage(error), "red").setAttribute("role", "status"); }
		});
		if (explanation) hint(parent, explanation);
		return b;
	}
	function section(parent, title) {
		const grid = element("div", parent, undefined, "settingsGrid");
		element("div", grid, title, "settingsHeader options");
		return element("div", grid, undefined, "settingsToggleItemWide");
	}
	function number(parent, title, value, min, max, step) {
		const label = element("label", parent, title, "eden-cheat-field");
		const input = element("input", label);
		Object.assign(input, { type: "number", value, min, max, step });
		return input;
	}
	function select(parent, title, values, current) {
		const label = element("label", parent, title, "eden-cheat-field");
		const input = element("select", label);
		for (const value of [...new Set([current, ...values])]) {
			const option = element("option", input, value === "" ? "无／默认" : words[value] || value);
			option.value = value;
		}
		input.value = current;
		return input;
	}
	function render(container) {
		try { renderContent(container); }
		catch (error) {
			container.replaceChildren();
			element("p", container, `无法打开作弊页：${errorMessage(error)}`, "red");
		}
	}
	function renderContent(container) {
		const api = window.EdenCheats;
		container.replaceChildren();
		if (!api?.available()) { element("p", container, "请先打开原版作弊页。"); return; }
		container.classList.add("eden-cheats");
		// Register any newly born children using the same setup as other Eden pages.
		const Wikifier = window.Wikifier || window.SugarCube?.Wikifier;
		if (typeof Wikifier !== "function" || !window.EdenChildData || !window.EdenTraining?.skillLabels) throw new Error("所需模块尚未就绪，请重新载入游戏。");
		const setup = document.createElement("div");
		new Wikifier(setup, "<<edenSetup>>");
		if (setup.querySelector(".error")) throw new Error("伊甸园数据初始化失败，请重新载入游戏。");
		const openedState = vars();
		const checkState = () => {
			if (vars() !== openedState) throw new Error("存档已切换，请重新打开生育扩展作弊页。");
		};
		const invoke = (action, id, child, record) => {
			try {
				checkState();
				if (id !== undefined && (window.EdenChildData.get(id) !== child || vars()?.eden?.children?.[id] !== record)) throw new Error("孩子数据已变化，请重新选择孩子。");
				return action();
			} catch (error) { return { ok: false, message: errorMessage(error) }; }
		};
		const pregnancy = section(container, "怀孕作弊扩展");
		const status = element("div", pregnancy, "");
		status.setAttribute("role", "status");
		const report = (result, output = status) => {
			output.textContent = result.message;
			output.className = result.ok ? "green" : "red";
			if (result.ok) try {
				const sidebar = document.createElement("div");
				new Wikifier(sidebar, "<<updatesidebarimg>>");
				if (sidebar.querySelector(".error")) throw new Error("sidebar");
			} catch (_) {
				output.textContent += " 操作已生效，但侧栏刷新失败，请重新打开页面查看。";
				output.className = "red";
			}
		};
		for (const [text, action, tip] of [
			["一键分娩", () => api.labour(), "将玩家当前孕期推进至足月并破水；鸟类到产卵期。之后继续原版生产流程。"],
			["寄生卵一键受精", () => api.parasites(true), "使两个部位的未受精寄生卵受精，孕期从头开始。"],
			["寄生物一键成熟", () => api.parasites(false), "使两个部位已受精的寄生物成熟；未受精卵不变，排出仍走原版流程。"],
		]) {
			const row = element("div", pregnancy, undefined, "eden-cheat-action");
			button(row, text, () => report(invoke(action)), tip);
		}
		element("hr", container);
		const picker = element("div", container, undefined, "eden-cheat-fields");
		picker.addEventListener("keydown", event => event.stopPropagation());
		const searchLabel = element("label", picker, "搜索孩子：", "eden-cheat-field");
		const search = element("input", searchLabel);
		Object.assign(search, { type: "search", placeholder: "输入孩子名称", autocomplete: "off" });
		const childLabel = element("label", picker, "选择孩子：", "eden-cheat-field");
		const list = element("select", childLabel);
		list.setAttribute("aria-label", "选择孩子");
		const childStatus = element("div", container, "");
		childStatus.setAttribute("role", "status");
		const editor = element("div", container);
		editor.addEventListener("keydown", event => event.stopPropagation());
		const edit = () => {
			editor.replaceChildren();
			checkState();
			const id = list.value;
			const child = window.EdenChildData.get(id);
			const v = vars();
			const record = v.eden?.children?.[id];
			if (!child || !record) return;
			const innate = section(editor, "生育作弊扩展");
			const fields = element("div", innate, undefined, "eden-cheat-fields");
			const values = {};
			for (const [key, title] of [["appearance", "容貌"], ["fitness", "体格"], ["intelligence", "智力"], ["temperament", "性格倾向"]]) {
				values[key] = number(fields, title, record.innate?.[key] ?? 50, 0, 100, 1);
			}
			hint(innate, "先天属性为 0～100 的整数；性格倾向 0～50 为安静，51～100 为活泼。修改仅影响所选孩子；已生成的简介、来信和聊天记录保持原文。");
			const looks = element("div", innate, undefined, "eden-cheat-fields");
			const identity = api.identity(child), options = api.choices(child);
			for (const [key, title] of [["species", "基础种族"], ["monster", "人形特征"], ["beastTransform", "兽化特征"], ["divineTransform", "神圣特征"], ["gender", "生理性别"], ["size", "体型"], ["hairColour", "发色／毛色"], ["eyeColour", "瞳色"], ["skinColour", "肤色"]]) {
				values[key] = select(looks, title, options[key], identity[key]);
			}
			const syncMonsterChoice = () => {
				values.monster.disabled = values.species.value === "human";
				if (values.monster.disabled) values.monster.value = "";
			};
			values.species.addEventListener("change", syncMonsterChoice);
			syncMonsterChoice();
			hint(innate, "人类本身已是人形；猫、狐、牛等使用人类基础种族与兽化特征。狼与鸟可选择人形特征。改种族会改变成长速度和养育资格。");
			const innateStatus = element("div", innate, "");
			innateStatus.setAttribute("role", "status");
			const read = controls => Object.fromEntries(Object.entries(controls).map(([k, input]) => [k, input.value]));
			const save = (inputs, action, output, refreshAfter = false) => {
				for (const input of Object.values(inputs)) {
					if (input.type !== "number") continue;
					const raw = String(input.value).trim(), n = Number(raw);
					if (!raw || !Number.isFinite(n) || n < 0 || n > 100) {
						report({ ok: false, message: "请输入0-100之间的数字" }, output); return;
					}
					if (Number(input.step) === 1 && !Number.isInteger(n)) {
						report({ ok: false, message: "先天属性请输入0-100之间的整数" }, output); return;
					}
				}
				const result = invoke(() => action(id, read(inputs)), id, child, record);
				if (result.ok && refreshAfter) {
					try { refresh(); }
					catch (_) { result.message += " 操作已生效，请重新打开作弊页刷新列表。"; }
					output = childStatus;
				}
				report(result, output);
			};
			button(innate, "保存先天属性与外貌", () => save(values, api.saveInnate, innateStatus, true));
			element("hr", editor);
			const training = section(editor, "养育作弊扩展");
			const skills = element("div", training, undefined, "eden-cheat-fields"), controls = {};
			for (const [key, title] of Object.entries(window.EdenTraining.skillLabels)) controls[key] = number(skills, title, record.training?.skills?.[key] ?? 0, 0, 100, 0.01);
			const trainingStatus = element("div", training, "");
			trainingStatus.setAttribute("role", "status");
			button(training, "保存养成属性", () => save(controls, api.saveSkills, trainingStatus), "范围 0～100。已完成的成年职业不会重新结算。");
			const actionWithConfirmation = (title, confirmation, warning, action, disabledReason = "") => {
				const row = element("div", training, undefined, "eden-cheat-action");
				const actions = element("div", row);
				const trigger = button(actions, title, () => {
					actions.replaceChildren();
					element("span", actions, `${child.name || "未命名"} · #${id}：${confirmation} `);
					button(actions, `确认${title === "删除孩子" ? "删除" : title === "重置养育进度" ? "重置" : "结算"}`, () => {
						const result = invoke(() => action(id), id, child, record);
						if (result.ok || title === "重置养育进度") try { refresh(); }
						catch (_) { if (result.ok) result.message += " 操作已生效，请重新打开作弊页刷新列表。"; }
						report(result, childStatus);
					});
					button(actions, "取消", edit);
				}, disabledReason || (title === "立刻成年结算" ? "按当前已保存属性结算，不补算养育收益；保留正在进行的孕期。" : title === "重置养育进度" ? "保留出生日期、身份、先天属性与好感；已成年者返回养育地点，不退还费用。" : undefined));
				trigger.disabled = Boolean(disabledReason);
				element("small", row, warning, "red eden-cheat-warning");
			};
			actionWithConfirmation("重置养育进度", "归零年龄、养成属性并清空日程？", "会清空成年之后的LLM以及孕期数据。", api.reset, api.resetReason(id));
			actionWithConfirmation("立刻成年结算", "立刻成年并重新判定未来？", "如果已成年会清空已判定数据进行重新结算，同时同步清空成年以后的所有LLM数据", api.settleAdult, api.adultReason(id));
			actionWithConfirmation("删除孩子", "永久删除该孩子？", "除了读取旧存档之外，该操作不可恢复", api.removeChild);
		};
		const refresh = () => {
			checkState();
			const selected = list.value, matches = api.children(search.value);
			list.replaceChildren();
			for (const [id, child] of matches) {
				const option = element("option", list, `${child.name || "未命名"} · #${id}`);
				option.value = id;
			}
			list.disabled = matches.length === 0;
			list.value = matches.some(([id]) => String(id) === selected) ? selected : String(matches[0]?.[0] ?? "");
			childStatus.textContent = matches.length ? "" : api.children().length ? "没有匹配的孩子。" : "暂无已出生的孩子。";
			edit();
		};
		const safeRefresh = action => () => {
			try { action(); }
			catch (error) { editor.replaceChildren(); report({ ok: false, message: errorMessage(error) }, childStatus); }
		};
		list.addEventListener("change", safeRefresh(edit));
		search.addEventListener("input", safeRefresh(refresh));
		refresh();
	}
	function ensure() {
		const overlay = document.getElementById("customOverlay"), tabs = overlay?.querySelector("#overlayTabs");
		if (!tabs) return;
		const existing = tabs.querySelector(`[${attribute}]`);
		if (overlay.dataset.overlay !== "cheats" || !window.EdenCheats?.available()) { existing?.remove(); return; }
		if (existing) return;
		const tab = element("button", tabs, "生育扩展作弊");
		tab.type = "button";
		tab.setAttribute(attribute, "");
		tab.addEventListener("click", () => {
			if (!window.EdenCheats.available()) return;
			const content = document.getElementById("cheatsShown");
			if (!content) return;
			tabs.querySelectorAll(":scope > button").forEach(b => b.classList.remove("tab-selected"));
			tab.classList.add("tab-selected");
			render(content);
			const wrapper = document.getElementById("customOverlayContent");
			if (wrapper) wrapper.scrollTop = 0;
		});
		// Native buttons use their own listeners; keep our selected state in sync.
		tabs.addEventListener("click", event => {
			if (event.target.closest("button") !== tab) tab.classList.remove("tab-selected");
		}, true);
	}
	function start() {
		ensure();
		const root = document.getElementById("customOverlay") || document.body;
		if (!root || root.dataset.edenCheatsObserved) return;
		root.dataset.edenCheatsObserved = "true";
		new MutationObserver(ensure).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-overlay", "class"] });
	}
	window.EdenCheatsUI = Object.freeze({ render, ensure });
	$(document).on(":storyready.edenCheats :passagedisplay.edenCheats", start);
	start();
})();
