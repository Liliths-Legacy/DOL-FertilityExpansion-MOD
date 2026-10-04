(() => {
	"use strict";

	const dataVersion = 2;
	const minimumDelayDays = 10;
	const maximumDelayDays = 30;
	const requiredFields = Object.freeze([
		"universityExperience",
		"economicSituation",
		"marriageSituation",
		"dailyLife",
		"attitudeToPc",
	]);
	const inFlight = new Map();
	let generationSerial = 0;

	function currentDay() {
		return Number(window.Time?.days) || 0;
	}

	function delayFor(record) {
		const seed = `${String(record?.childId ?? "unknown")}|${Number(record?.adult?.settledDay) || 0}|life-story-v2`;
		let hash = 2166136261;
		for (let index = 0; index < seed.length; index += 1) {
			hash ^= seed.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return minimumDelayDays + ((hash >>> 0) % (maximumDelayDays - minimumDelayDays + 1));
	}

	function createState(record) {
		const settledDay = Number(record?.adult?.settledDay);
		const delayDays = delayFor(record);
		return {
			dataVersion,
			status: "waiting",
			delayDays,
			dueDay: (Number.isFinite(settledDay) ? settledDay : currentDay()) + delayDays,
			discoveredDay: null,
			generatedDay: null,
			readDay: null,
			inputSnapshot: null,
			content: null,
			providerModel: null,
			error: null,
		};
	}

	function isUniversityOutcome(record) {
		return Boolean(
			record?.bodyForm !== "beast" &&
			record?.adult?.settled &&
			record.adult.destination === "away" &&
			record.adult.education === "university" &&
			record.adult.outcome === "awayWork"
		);
	}

	function ensureState(record) {
		if (!isUniversityOutcome(record)) return null;
		if (!record.adult.lifeStory || typeof record.adult.lifeStory !== "object" || Array.isArray(record.adult.lifeStory)) {
			record.adult.lifeStory = createState(record);
		}
		const state = record.adult.lifeStory;
		if ((Number(state.dataVersion) || 1) < 2) {
			const settledDay = Number(record?.adult?.settledDay);
			// A legacy letter already has an arrival date. Preserve its schedule
			// when IDs change instead of deriving a different delay from the new ID.
			const savedDelay = Number.isFinite(state.dueDay) && Number.isFinite(settledDay) ? state.dueDay - settledDay : NaN;
			state.delayDays = Number.isFinite(savedDelay) && savedDelay >= minimumDelayDays && savedDelay <= maximumDelayDays ? savedDelay : delayFor(record);
		}
		state.dataVersion = dataVersion;
		if (!Number.isFinite(state.delayDays) || state.delayDays < minimumDelayDays || state.delayDays > maximumDelayDays) state.delayDays = delayFor(record);
		if (!Number.isFinite(state.dueDay)) {
			const settledDay = Number(record?.adult?.settledDay);
			state.dueDay = (Number.isFinite(settledDay) ? settledDay : currentDay()) + state.delayDays;
		}
		if (!["waiting", "discovered", "generating", "ready", "read", "error"].includes(state.status)) state.status = "waiting";
		if (state.status === "generating" && (!inFlight.has(String(record.childId)) || inFlight.get(String(record.childId))?.token !== state.generationToken)) {
			state.status = "error";
			state.error = "上一次生成在完成前中断，可以重试。";
		}
		return state;
	}

	function syncRecord(record) {
		return ensureState(record);
	}

	function syncAll(eden) {
		if (!eden?.children) return;
		Object.values(eden.children).forEach(syncRecord);
	}

	function nextDue(eden) {
		if (!eden?.children) return null;
		const immediate = eden.settings?.immediateLifeStory === true;
		return Object.entries(eden.children)
			.filter(([, record]) => {
				const state = ensureState(record);
				return state?.status === "waiting" && (immediate || currentDay() >= state.dueDay);
			})
			.sort((left, right) => left[1].adult.lifeStory.dueDay - right[1].adult.lifeStory.dueDay || String(left[0]).localeCompare(String(right[0])))[0]?.[0] || null;
	}

	function markDiscovered(record) {
		const state = ensureState(record);
		if (!state) return null;
		if (state.status === "waiting") state.status = "discovered";
		if (!Number.isFinite(state.discoveredDay)) state.discoveredDay = currentDay();
		return state;
	}

	function markRead(record) {
		const state = ensureState(record);
		if (!state?.content) return false;
		state.status = "read";
		if (!Number.isFinite(state.readDay)) state.readDay = currentDay();
		return true;
	}

	function resetForRetry(record) {
		const state = ensureState(record);
		if (!state || state.status !== "error") return false;
		state.status = "discovered";
		state.error = null;
		return true;
	}

	function genderLabel(child) {
		if (child?.gender === "m") return "男性";
		if (child?.gender === "f") return "女性";
		return "其他或不详";
	}

	function buildSnapshot(record, child) {
		const skills = record?.training?.skills || {};
		const innate = record?.innate || {};
		const career = window.EdenAdult?.config?.universityCareers?.[record?.adult?.career];
		const parents = window.EdenChildData?.parentsOf(child) || { mother: child?.mother, father: child?.father };
		const name = String(child?.name || "这个孩子");
		const adopted = window.EdenChildData?.isAdopted(child) ?? Boolean(child?.adopted);
		const pcParentRole = parents.mother === "pc" ? "mother" : parents.father === "pc" ? "father" : adopted ? "adoptive" : "unknown";
		const relationships = { mother: `你是生下${name}的妈妈`, father: `你是${name}的爸爸`, adoptive: `你是${name}的养父母`, unknown: `你是${name}的家长` };
		return {
			name: String(child?.name || "未命名的孩子"),
			gender: genderLabel(child),
			species: String(record?.speciesLabel || record?.species || "其他"),
			pcParentRole,
			pcRelationship: relationships[pcParentRole],
			innate: {
				appearance: Number(innate.appearance) || 0,
				fitness: Number(innate.fitness) || 0,
				intelligence: Number(innate.intelligence) || 0,
				personality: innate.personality === "active" ? "活泼" : "安静",
				temperament: Number(innate.temperament) || 0,
			},
			skills: {
				knowledge: Number(skills.knowledge) || 0,
				fitness: Number(skills.fitness) || 0,
				social: Number(skills.social) || 0,
				awareness: Number(skills.awareness) || 0,
			},
			career: String(career?.label || "公司职员"),
			affectionToYou: Number(record?.affection) || 0,
			profile: String(record?.profile || "").slice(0, 10000),
		};
	}

	function stripCodeFence(text) {
		const trimmed = String(text || "").trim();
		const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
		return fenced ? fenced[1].trim() : trimmed;
	}

	function parseContent(text) {
		const cleaned = stripCodeFence(text);
		const start = cleaned.indexOf("{");
		const end = cleaned.lastIndexOf("}");
		if (start < 0 || end <= start) throw new Error("模型返回的内容不是JSON对象。");
		let parsed;
		try {
			parsed = JSON.parse(cleaned.slice(start, end + 1));
		} catch (error) {
			throw new Error(`无法解析模型返回的JSON：${error.message}`);
		}
		const content = {};
		for (const field of requiredFields) {
			if (typeof parsed?.[field] !== "string" || !parsed[field].trim()) throw new Error(`模型返回缺少字段：${field}。`);
			content[field] = parsed[field].trim().slice(0, 12000);
		}
		content.photoDescriptions = Array.isArray(parsed.photoDescriptions)
			? parsed.photoDescriptions.filter(item => typeof item === "string" && item.trim()).slice(0, 5).map(item => item.trim().slice(0, 2000))
			: [];
		return content;
	}

	function liveRecord(childId) {
		return window.SugarCube?.State?.variables?.eden?.children?.[childId] || null;
	}

	function currentPassage() {
		return window.SugarCube?.State?.passage || window.State?.passage || "";
	}

	function playPassage(name) {
		const engine = window.Engine || window.SugarCube?.Engine;
		if (engine?.play) engine.play(name);
	}

	async function startGeneration(eden, children, childId) {
		if (childId === null || childId === undefined || childId === "") return null;
		const id = String(childId);
		const record = eden?.children?.[id];
		const child = children?.[id];
		const pending = inFlight.get(id);
		if (pending && record?.adult?.lifeStory?.generationToken === pending.token) return pending.promise;
		const state = ensureState(record);
		if (!state || !child) throw new Error("无法找到这封来信对应的孩子。");
		if (state.content) {
			state.status = state.status === "read" ? "read" : "ready";
			return state.content;
		}
		if (!window.EdenLLM || !window.EdenLifeStoryPrompt) throw new Error("大模型来信模块未正确加载。");
		markDiscovered(record);
		if (!state.inputSnapshot) state.inputSnapshot = buildSnapshot(record, child);
		state.status = "generating";
		state.error = null;
		const token = window.crypto?.randomUUID?.() || `${Date.now()}:${++generationSerial}`;
		state.generationToken = token;

		function targetState() {
			const live = liveRecord(id);
			if (live?.adult?.lifeStory?.generationToken !== token) return null;
			return ensureState(live);
		}
		function onGenerationPage() {
			const selectedId = window.SugarCube?.State?.variables?.eden?.selectedChildId;
			return currentPassage() === "Eden Life Story Generate" && String(selectedId) === id;
		}

		const task = Promise.resolve().then(async () => {
			try {
				const variables = window.SugarCube?.State?.variables || window.State?.variables;
				const customPrompt = variables?.options?.eden?.lifeStoryPrompt ?? variables?.eden?.settings?.lifeStoryPrompt ?? "";
				const messages = window.EdenLifeStoryPrompt.buildMessages(state.inputSnapshot, customPrompt);
				const result = await window.EdenLLM.chat(messages, {
					jsonObject: true,
					disableThinking: true,
				});
				const content = parseContent(result.text);
				const target = targetState();
				if (!target) return null; // A load/undo replaced this generation request.
				target.content = content;
				target.status = "ready";
				target.generatedDay = currentDay();
				target.providerModel = result.model;
				target.error = null;
				if (onGenerationPage()) playPassage("Eden Life Story Read");
				return content;
			} catch (error) {
				const target = targetState();
				if (target) {
					target.status = "error";
					target.error = error?.message || String(error);
				}
				if (target && onGenerationPage()) playPassage("Eden Life Story Generate");
				return null;
			} finally {
				if (inFlight.get(id)?.token === token) inFlight.delete(id);
			}
		});
		inFlight.set(id, { token, promise: task });
		return task;
	}

	function hasLetter(record) {
		const state = ensureState(record);
		return Boolean(state && ["discovered", "generating", "ready", "read", "error"].includes(state.status));
	}

	function canRead(record) {
		return Boolean(ensureState(record)?.content);
	}

	window.EdenLifeStory = Object.freeze({
		dataVersion,
		minimumDelayDays,
		maximumDelayDays,
		delayFor,
		ensureState,
		syncRecord,
		syncAll,
		nextDue,
		markDiscovered,
		markRead,
		resetForRetry,
		buildSnapshot,
		parseContent,
		startGeneration,
		hasLetter,
		canRead,
	});
})();
