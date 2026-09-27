(() => {
	"use strict";

	const dataVersion = 1;
	const databaseName = "fertility-expansion";
	const storeName = "settings";
	const settingsKey = "llm";
	const defaults = Object.freeze({
		enabled: false,
		apiUrl: "",
		apiKey: "",
		modelName: "",
		temperature: 0.8,
		maxTokens: 3000,
		requestTimeoutMs: 60000,
	});
	let current = { ...defaults };
	let databasePromise = null;

	function normalize(settings) {
		const source = settings && typeof settings === "object" ? settings : {};
		return {
			enabled: source.enabled === true,
			apiUrl: String(source.apiUrl || "").trim(),
			apiKey: String(source.apiKey || "").trim(),
			modelName: String(source.modelName || "").trim(),
			temperature: Math.min(2, Math.max(0, Number(source.temperature) || defaults.temperature)),
			maxTokens: Math.min(12000, Math.max(256, Math.round(Number(source.maxTokens) || defaults.maxTokens))),
			requestTimeoutMs: Math.min(180000, Math.max(10000, Math.round(Number(source.requestTimeoutMs) || defaults.requestTimeoutMs))),
		};
	}

	function openDatabase() {
		if (databasePromise) return databasePromise;
		databasePromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(databaseName, 1);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error || new Error("无法打开浏览器设置存储。"));
		});
		return databasePromise;
	}

	async function readStoredSettings() {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const request = database.transaction(storeName, "readonly").objectStore(storeName).get(settingsKey);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error || new Error("无法读取大模型设置。"));
		});
	}

	async function writeStoredSettings(settings) {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const transaction = database.transaction(storeName, "readwrite");
			transaction.objectStore(storeName).put(settings, settingsKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("无法保存大模型设置。"));
		});
	}

	const ready = (async () => {
		try {
			current = normalize(await readStoredSettings());
		} catch (error) {
			console.warn("[FertilityExpansion] Failed to load LLM settings", error);
		}
		return { ...current };
	})();

	async function getSettings() {
		await ready;
		return { ...current };
	}

	async function updateSettings(patch) {
		await ready;
		current = normalize({ ...current, ...(patch || {}) });
		await writeStoredSettings(current);
		return { ...current };
	}

	function isConfigured(settings = current) {
		return Boolean(settings.enabled && settings.apiUrl && settings.apiKey && settings.modelName);
	}

	function baseUrl(value) {
		return String(value || "").trim().replace(/\/+$/, "");
	}

	function modelsEndpoint(value) {
		const base = baseUrl(value);
		return base.endsWith("/models") ? base : `${base}/models`;
	}

	function chatEndpoint(value) {
		const base = baseUrl(value);
		return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
	}

	async function fetchWithTimeout(url, init, timeoutMs) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controller.signal });
		} catch (error) {
			if (error?.name === "AbortError") throw new Error("请求超时。");
			if (error instanceof TypeError) throw new Error(`无法访问接口，可能是网络、CORS或CSP限制：${error.message}`);
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}

	async function responseError(response) {
		let detail = "";
		try {
			detail = (await response.text()).slice(0, 500);
		} catch (_) {
			/* Ignore response-body failures. */
		}
		if (response.status === 401 || response.status === 403) return new Error(`API密钥被拒绝（HTTP ${response.status}）。`);
		if (response.status === 429) return new Error("接口请求过于频繁或额度不足（HTTP 429）。");
		return new Error(`大模型接口返回 HTTP ${response.status}${detail ? `：${detail}` : "。"}`);
	}

	async function testConnection(settingsOverride) {
		const settings = normalize(settingsOverride || (await getSettings()));
		if (!settings.apiUrl) throw new Error("请先填写API地址。");
		const response = await fetchWithTimeout(
			modelsEndpoint(settings.apiUrl),
			{
				method: "GET",
				headers: {
					Accept: "application/json",
					...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
				},
			},
			10000
		);
		if (!response.ok) throw await responseError(response);
		return { ok: true, message: "连接成功。" };
	}

	async function chat(messages, options = {}) {
		const settings = await getSettings();
		if (!isConfigured(settings)) throw new Error("大模型人生故事尚未启用或接口配置不完整。");
		const payload = {
			model: settings.modelName,
			messages: messages.map(message => ({ role: String(message.role), content: String(message.content) })),
			temperature: Number.isFinite(options.temperature) ? options.temperature : settings.temperature,
			max_tokens: Number.isFinite(options.maxTokens) ? Math.round(options.maxTokens) : settings.maxTokens,
		};
		if (options.jsonObject === true) payload.response_format = { type: "json_object" };
		if (options.disableThinking === true) {
			try {
				const hostname = new URL(settings.apiUrl).hostname.toLowerCase();
				if (hostname === "deepseek.com" || hostname.endsWith(".deepseek.com")) payload.thinking = { type: "disabled" };
			} catch (_) {
				/* URL validation and the request itself will provide the useful error. */
			}
		}
		const response = await fetchWithTimeout(
			chatEndpoint(settings.apiUrl),
			{
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					Authorization: `Bearer ${settings.apiKey}`,
				},
				body: JSON.stringify(payload),
			},
			settings.requestTimeoutMs
		);
		if (!response.ok) throw await responseError(response);
		const result = await response.json();
		const content = result?.choices?.[0]?.message?.content;
		if (typeof content !== "string" || !content.trim()) throw new Error("接口没有返回可用的文本。");
		return { text: content.trim(), model: String(result.model || settings.modelName) };
	}

	function addField(parent, labelText, input) {
		const item = document.createElement("div");
		item.className = "settingsToggleItemWide";
		const label = document.createElement("label");
		label.textContent = `${labelText}：`;
		label.style.display = "block";
		input.style.boxSizing = "border-box";
		input.style.maxWidth = "100%";
		input.style.width = "100%";
		label.appendChild(input);
		item.appendChild(label);
		parent.appendChild(item);
	}

	function savedCreativePrompt() {
		const variables = window.SugarCube?.State?.variables || window.State?.variables;
		const value = variables?.options?.eden?.lifeStoryPrompt ?? variables?.eden?.settings?.lifeStoryPrompt;
		return typeof value === "string" ? value : "";
	}

	function savedImmediateLifeStory() {
		const variables = window.SugarCube?.State?.variables || window.State?.variables;
		return (variables?.options?.eden?.immediateLifeStory ?? variables?.eden?.settings?.immediateLifeStory) === true;
	}

	function updateCreativePrompt(value) {
		const variables = window.SugarCube?.State?.variables || window.State?.variables;
		if (!variables) throw new Error("当前游戏存档尚未就绪，无法保存提示词。");
		const defaultPrompt = String(window.EdenLifeStoryPrompt?.defaultCreativePrompt || "");
		const input = String(value || "");
		/* Empty storage means 'follow the bundled default' across future updates. */
		const stored = input.trim() === defaultPrompt.trim() ? "" : input;
		if (!variables.options || typeof variables.options !== "object") variables.options = {};
		if (!variables.options.eden || typeof variables.options.eden !== "object") variables.options.eden = {};
		variables.options.eden.lifeStoryPrompt = stored;
		if (!variables.eden || typeof variables.eden !== "object") variables.eden = {};
		if (!variables.eden.settings || typeof variables.eden.settings !== "object") variables.eden.settings = {};
		variables.eden.settings.lifeStoryPrompt = stored;
		return stored;
	}

	function updateImmediateLifeStory(value) {
		const variables = window.SugarCube?.State?.variables || window.State?.variables;
		if (!variables) throw new Error("当前游戏存档尚未就绪，无法保存来信时机。");
		if (!variables.options || typeof variables.options !== "object") variables.options = {};
		if (!variables.options.eden || typeof variables.options.eden !== "object") variables.options.eden = {};
		variables.options.eden.immediateLifeStory = value === true;
		if (!variables.eden || typeof variables.eden !== "object") variables.eden = {};
		if (!variables.eden.settings || typeof variables.eden.settings !== "object") variables.eden.settings = {};
		variables.eden.settings.immediateLifeStory = value === true;
		return value === true;
	}

	async function renderSettings(container) {
		if (!container) return;
		container.replaceChildren();
		container.addEventListener("keydown", event => event.stopPropagation());
		const settings = await getSettings();
		const header = document.createElement("div");
		header.className = "settingsHeader";
		header.textContent = "生育拓展·人生来信";
		container.appendChild(header);

		const timingItem = document.createElement("div");
		timingItem.className = "settingsToggleItemWide";
		const timingLabel = document.createElement("label");
		const immediateLifeStory = document.createElement("input");
		immediateLifeStory.type = "checkbox";
		immediateLifeStory.checked = savedImmediateLifeStory();
		immediateLifeStory.id = "eden-llm-immediate-life-story";
		timingLabel.append(immediateLifeStory, document.createTextNode(" 成年时立刻收到人生来信"));
		timingItem.appendChild(timingLabel);
		const timingNote = document.createElement("small");
		timingNote.textContent = "关闭时，大学路线孩子会在成年结算后随机10至30天来信；逾期不会错过。开启后，已有的符合条件孩子也会在下一次进入伊甸园时立即进入来信队列。";
		timingItem.append(document.createElement("br"), timingNote);
		container.appendChild(timingItem);
		immediateLifeStory.addEventListener("change", () => updateImmediateLifeStory(immediateLifeStory.checked));

		const toggleItem = document.createElement("div");
		toggleItem.className = "settingsToggleItemWide";
		const toggleLabel = document.createElement("label");
		const enabled = document.createElement("input");
		enabled.type = "checkbox";
		enabled.checked = settings.enabled;
		enabled.id = "eden-llm-enabled";
		toggleLabel.append(enabled, document.createTextNode(" 启用人生来信"));
		toggleItem.appendChild(toggleLabel);
		container.appendChild(toggleItem);

		const apiUrl = document.createElement("input");
		apiUrl.type = "text";
		apiUrl.id = "eden-llm-api-url";
		apiUrl.placeholder = "https://api.example.com/v1";
		apiUrl.value = settings.apiUrl;
		addField(container, "OpenAI兼容API地址", apiUrl);

		const apiKey = document.createElement("input");
		apiKey.type = "password";
		apiKey.id = "eden-llm-api-key";
		apiKey.placeholder = "sk-...";
		apiKey.value = settings.apiKey;
		addField(container, "API密钥", apiKey);

		const modelName = document.createElement("input");
		modelName.type = "text";
		modelName.id = "eden-llm-model";
		modelName.placeholder = "模型名称";
		modelName.value = settings.modelName;
		addField(container, "模型名称", modelName);

		const creativePrompt = document.createElement("textarea");
		creativePrompt.id = "eden-llm-life-story-prompt";
		creativePrompt.rows = 18;
		creativePrompt.style.resize = "vertical";
		creativePrompt.style.minHeight = "18em";
		creativePrompt.value = savedCreativePrompt() || String(window.EdenLifeStoryPrompt?.defaultCreativePrompt || "");
		addField(container, "人生来信叙事提示词（可编辑）", creativePrompt);

		const promptNote = document.createElement("div");
		promptNote.className = "settingsToggleItemWide";
		promptNote.innerHTML = "<small>这里只修改叙事内容与文风。JSON字段、字段类型、纯JSON输出以及人物简介的安全边界由模组固定，不会被此处文字覆盖。提示词随当前游戏存档保存。</small>";
		const resetPromptButton = document.createElement("button");
		resetPromptButton.type = "button";
		resetPromptButton.textContent = "恢复默认提示词";
		resetPromptButton.style.marginTop = "0.5em";
		resetPromptButton.addEventListener("click", () => {
			creativePrompt.value = String(window.EdenLifeStoryPrompt?.defaultCreativePrompt || "");
		});
		promptNote.append(document.createElement("br"), resetPromptButton);
		container.appendChild(promptNote);

		const note = document.createElement("div");
		note.className = "settingsToggleItemWide";
		note.innerHTML = "<small>API密钥只保存在当前浏览器的IndexedDB中，不会写入或导出到游戏存档。直连服务仍可能受CORS或CSP限制。</small>";
		container.appendChild(note);

		const actions = document.createElement("div");
		actions.className = "settingsToggleItemWide";
		const saveButton = document.createElement("button");
		saveButton.type = "button";
		saveButton.textContent = "保存设置";
		const testButton = document.createElement("button");
		testButton.type = "button";
		testButton.textContent = "测试连接";
		testButton.style.marginLeft = "0.5em";
		const status = document.createElement("span");
		status.style.marginLeft = "0.75em";
		actions.append(saveButton, testButton, status);
		container.appendChild(actions);

		const readForm = () => normalize({
			enabled: enabled.checked,
			apiUrl: apiUrl.value,
			apiKey: apiKey.value,
			modelName: modelName.value,
			temperature: settings.temperature,
			maxTokens: settings.maxTokens,
			requestTimeoutMs: settings.requestTimeoutMs,
		});
		saveButton.addEventListener("click", async () => {
			status.className = "";
			status.textContent = "正在保存……";
			try {
				await updateSettings(readForm());
				updateCreativePrompt(creativePrompt.value);
				updateImmediateLifeStory(immediateLifeStory.checked);
				status.className = "green";
				status.textContent = "已保存。";
			} catch (error) {
				status.className = "red";
				status.textContent = error?.message || String(error);
			}
		});
		testButton.addEventListener("click", async () => {
			status.className = "";
			status.textContent = "正在测试……";
			try {
				const result = await testConnection(readForm());
				status.className = "green";
				status.textContent = result.message;
			} catch (error) {
				status.className = "red";
				status.textContent = error?.message || String(error);
			}
		});
	}

	window.EdenLLM = Object.freeze({
		dataVersion,
		defaults,
		ready,
		getSettings,
		updateSettings,
		isConfigured,
		testConnection,
		chat,
		updateCreativePrompt,
		updateImmediateLifeStory,
		renderSettings,
	});
})();
