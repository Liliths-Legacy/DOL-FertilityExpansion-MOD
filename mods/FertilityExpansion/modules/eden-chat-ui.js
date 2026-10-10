;(() => {
	"use strict";
	function node(tag, text, parent) {
		const element = document.createElement(tag);
		if (text !== undefined) element.textContent = text;
		if (parent) parent.appendChild(element);
		return element;
	}
	function field(parent, title, value, type = "text") {
		const label = node("label", title, parent);
		label.className = "eden-chat-field";
		const input = node(type === "textarea" ? "textarea" : "input", undefined, label);
		if (type !== "textarea") input.type = type;
		else input.rows = 5;
		input.value = value || "";
		return input;
	}
	function button(parent, text, action) {
		const element = node("button", text, parent);
		element.type = "button";
		element.addEventListener("click", action);
		return element;
	}
	function mount(container, id) {
		if (!container) return;
		container.replaceChildren();
		container.addEventListener("keydown", event => event.stopPropagation());
		try {
			const variables = window.SugarCube?.State?.variables || window.State?.variables;
			const record = variables?.eden?.children?.[id];
			if (!window.EdenChat.eligible(record)) throw new Error("这位孩子目前无法联系。");
			const state = window.EdenChat.ensure(record), player = window.EdenChat.identity();
			const child = window.EdenChildData.get(id);
			if (!child) throw new Error("无法找到这位孩子的资料。");
			const childName = child.name || "孩子";
			node("p", `与${childName}聊天`, container);
			const editor = node("details", undefined, container);
			node("summary", "编辑身份卡与人设卡", editor).className = "eden-chat-edit";
			const name = field(editor, "你的名称", player.name);
			name.maxLength = 200;
			const profile = field(editor, "你的简介", player.profile, "textarea");
			const character = field(editor, `${childName}的人设卡（不覆盖原简介）`, state.characterCard, "textarea");
			profile.maxLength = character.maxLength = 10000;
			const cardStatus = node("small", "", editor);
			button(editor, "保存人物卡", () => {
				if (!session.valid()) return;
				window.EdenChat.saveCards(id, { name: name.value, profile: profile.value }, character.value);
				cardStatus.textContent = "已保存，从下一次请求起使用；不会重写既有经历。";
			});
			const log = node("div", undefined, container);
			log.className = "eden-chat-history";
			log.setAttribute("role", "log");
			log.setAttribute("aria-label", "聊天记录");
			const error = node("div", undefined, container);
			error.className = "red";
			const retry = button(container, "重试未完成的消息", () => { void session.retry(); });
			const memoryNote = node("small", undefined, container);
			const retryMemory = button(container, "重试整理经历", () => { void session.retryMemory(); });
			const input = field(container, "消息", "", "textarea");
			input.rows = 3;
			input.maxLength = 10000;
			const sendActions = node("div", undefined, container);
			sendActions.className = "eden-chat-send-actions";
			button(sendActions, "发送", () => {
				if (session.send(input.value)) {
					input.value = "";
					(window.UIBar || window.SugarCube?.UIBar)?.update?.();
				}
			});
			const render = current => {
				if (!container.isConnected) return;
				log.replaceChildren();
				for (const message of current.history) {
					const item = node("div", undefined, log);
					item.className = `eden-chat-message eden-chat-${message.sender}`;
					node("small", `${message.sender === "player" ? window.EdenChat.identity().name || "你" : childName} · ${window.EdenChat.timeLabel(message.time)}`, item).className = "grey";
					node("div", message.content, item);
				}
				error.textContent = current.error ? `消息未完成：${current.error} 已发送的消息仍保留。` : "";
				retry.hidden = !current.error;
				memoryNote.textContent = current.memoryError ? "经历暂未整理，原记录已保留，不影响继续聊天。" : "";
				retryMemory.hidden = !current.memoryError;
				log.scrollTop = log.scrollHeight;
			};
			const session = window.EdenChat.open(id, render);
			render(state);
		} catch (error) { node("p", error.message, container).className = "red"; }
	}
	async function renderSettings(container) {
		if (!container) return;
		container.replaceChildren();
		container.addEventListener("keydown", event => event.stopPropagation());
		node("div", "生育拓展·成年孩子聊天", container).className = "settingsHeader";
		node("small", "经历与会话使用独立配置，也可填同一接口与模型。调用会向所填服务发送人物卡、孩子资料、经历及聊天记录；请勿填写敏感个人信息。API密钥仅保存在当前浏览器，不随游戏存档导出。", container);
		for (const [kind, title] of [["experience", "经历模型（背景、新经历与记忆整理）"], ["conversation", "会话模型（每次发消息）"]]) {
			const section = node("div", undefined, container);
			section.className = "settingsToggleItemWide";
			node("p", title, section);
			try {
				const settings = await window.EdenLLM.getChatSettings(kind);
				const label = node("label", undefined, section);
				const enabled = node("input", undefined, label);
				enabled.type = "checkbox";
				enabled.checked = settings.enabled;
				label.appendChild(document.createTextNode(" 启用"));
				const url = field(section, "OpenAI兼容API地址", settings.apiUrl);
				const key = field(section, "API密钥", settings.apiKey, "password");
				const model = field(section, "模型名称", settings.modelName);
				const status = node("div", "", section);
				const read = () => ({ ...settings, enabled: enabled.checked, apiUrl: url.value, apiKey: key.value, modelName: model.value });
				const act = async action => {
					try { await action(); status.textContent = "完成。"; status.className = "green"; }
					catch (error) { status.textContent = error.message; status.className = "red"; }
				};
				button(section, "保存设置", () => act(() => window.EdenLLM.updateChatSettings(kind, read())));
				button(section, "测试连接", () => act(() => window.EdenLLM.testConnection(read())));
				button(section, "填入人生来信的接口配置", () => act(async () => {
					const existing = await window.EdenLLM.getSettings();
					url.value = existing.apiUrl; key.value = existing.apiKey; model.value = existing.modelName;
				}));
			} catch (error) { node("p", `无法读取配置：${error.message}`, section).className = "red"; }
		}
	}
	window.EdenChatUI = Object.freeze({ mount, renderSettings });
})();
