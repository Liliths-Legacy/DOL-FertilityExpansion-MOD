;(() => {
	"use strict";
	const config = Object.freeze({ minimumGapSeconds: 7200, historyLimit: 50, experienceLimit: 50, compactTarget: 30,
		playerMessageSeconds: 60, replyBaseMs: 400, replyCharacterMs: 140, replyMinimumMs: 800, replyMaximumMs: 5000 });
	function replyDelay(content) {
		return Math.min(config.replyMaximumMs, Math.max(config.replyMinimumMs,
			config.replyBaseMs + Array.from(String(content)).length * config.replyCharacterMs));
	}
	const jobs = new WeakMap();
	const vars = () => window.SugarCube?.State?.variables || window.State?.variables;
	const now = () => Number.isFinite(window.Time?.date?.timeStamp) ? window.Time.date.timeStamp
		: Math.floor((Number(window.Time?.days) || 0) * 86400 + (Number(window.Time?.hour) || 0) * 3600 + (Number(window.Time?.minute) || 0) * 60);
	function timeLabel(value) {
		const Calendar = window.DateTime || (typeof DateTime === "function" ? DateTime : null);
		if (Calendar) {
			const date = new Calendar(value);
			return `${date.year}年${date.month}月${date.day}日 ${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;
		}
		return `第${Math.floor(value / 86400)}天 ${String(Math.floor(value % 86400 / 3600)).padStart(2, "0")}:${String(Math.floor(value % 3600 / 60)).padStart(2, "0")}`;
	}
	function eligible(record) { return record?.bodyForm !== "beast" && record?.adult?.settled === true && record.adult.contactStatus === "active"; }
	function ensure(record) {
		if (!record.chat || typeof record.chat !== "object") record.chat = {};
		const state = record.chat;
		state.version = 1;
		for (const key of ["experiences", "history", "outbox", "incoming"]) if (!Array.isArray(state[key])) state[key] = [];
		for (const key of ["background", "characterCard"]) if (typeof state[key] !== "string") state[key] = "";
		state.serial = Number(state.serial) || 0;
		if (!Number.isFinite(state.lastContactAt)) state.lastContactAt = null;
		state.history = state.history.slice(-config.historyLimit);
		return state;
	}
	function identity() {
		const eden = vars().eden;
		if (!eden.chatIdentity || typeof eden.chatIdentity !== "object") eden.chatIdentity = { name: "", profile: "" };
		return eden.chatIdentity;
	}
	function saveCards(id, player, characterCard) {
		const record = vars()?.eden?.children?.[id];
		if (!eligible(record)) throw new Error("这位孩子目前无法联系。");
		Object.assign(identity(), { name: String(player.name || "").slice(0, 200), profile: String(player.profile || "").slice(0, 10000) });
		ensure(record).characterCard = String(characterCard || "").slice(0, 10000);
	}
	function context(record, child, state) {
		const person = window.EdenLifeStory.buildSnapshot(record, child);
		const careers = record.adult.destination === "away" ? window.EdenAdult?.config?.universityCareers : window.EdenAdult?.config?.careers;
		person.career = careers?.[record.adult.career]?.label || window.EdenAdult?.careerLabel?.(record) || record.adult.career || "未定";
		person.destination = record.adult.destination;
		person.education = record.adult.education || "未指定";
		person.pcParentTitle = window.EdenChildData.parentTitleOf?.(child)
			|| (person.pcParentRole === "mother" ? "妈妈" : person.pcParentRole === "father" ? "爸爸" : "家长");
		return { person, identity: { ...identity() }, characterCard: state.characterCard, background: state.background,
			experiences: state.experiences.map(item => ({ ...item })), letter: record.adult.lifeStory?.content || null, time: timeLabel(now()) };
	}
	function parse(text) {
		let value;
		try { value = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
		catch (_) { throw new Error("模型返回的内容不是有效JSON，请重试。"); }
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模型必须返回JSON对象。");
		return value;
	}
	function nonempty(value) { return typeof value === "string" && value.trim() && value.length <= 30000; }
	function parseReply(text) {
		const value = parse(text);
		if (!["yes", "no"].includes(value.is_reply) || !Array.isArray(value.reply_content)
			|| !value.reply_content.every(nonempty) || (value.is_reply === "no" ? value.reply_content.length !== 0 : value.reply_content.length === 0)) {
			throw new Error("会话模型返回的回复格式不正确，请重试。");
		}
		return value;
	}
	async function request(kind, messages) {
		const settings = await window.EdenLLM.getChatSettings(kind);
		if (!window.EdenLLM.isConfigured(settings)) throw new Error(`请在生育拓展选项中启用并配置${kind === "experience" ? "经历" : "会话"}模型。`);
		return (await window.EdenLLM.chat(messages, { settings, jsonObject: true, disableThinking: true })).text;
	}
	function append(state, sender, content, time = now()) {
		const message = { id: ++state.serial, sender, time, content };
		state.history.push(message);
		state.history = state.history.slice(-config.historyLimit);
		return message;
	}
	function compactResult(text, original) {
		const entries = parse(text).experiences;
		const starts = new Set(original.map(item => item.start)), ends = new Set(original.map(item => item.end));
		if (!Array.isArray(entries) || !entries.length || entries.length > config.compactTarget || !entries.every(item => item &&
			starts.has(item.start) && ends.has(item.end) && item.start <= item.end && nonempty(item.content))) throw new Error("经历整理格式不正确，原经历已保留。");
		return entries.map(({ start, end, content }) => ({ start, end, content })).sort((a, b) => a.start - b.start);
	}
	function open(id, notify = () => {}) {
		id = String(id);
		const variables = vars(), record = variables?.eden?.children?.[id], child = window.EdenChildData?.get(id);
		if (!eligible(record) || !child) throw new Error("这位孩子目前无法联系。");
		const state = ensure(record);
		const old = jobs.get(state);
		if (old?.valid()) { old.notify = notify; return old; }
		const entryTime = now();
		const session = { ready: false, busy: false, notify, state,
			valid: () => jobs.get(state) === session && vars() === variables && variables.eden?.children?.[id]?.chat === state && eligible(record)
				&& String(variables.eden.selectedChildId) === id
				&& (window.SugarCube?.State?.passage || window.State?.passage) === "Eden Chat" };
		jobs.set(state, session);
		const refresh = () => { if (session.valid()) session.notify(state); };
		async function prepare() {
			if (!state.background) {
				const answer = parse(await request("experience", window.EdenChatPrompt.foundation(context(record, child, state))));
				if (!session.valid()) return false;
				if (!nonempty(answer.background)) throw new Error("经历基础为空或格式不正确，请重试。");
				state.background = answer.background;
				state.backgroundAt = entryTime;
			} else if (state.lastContactAt !== null && entryTime - state.lastContactAt > config.minimumGapSeconds) {
				const start = state.lastContactAt;
				const answer = parse(await request("experience", window.EdenChatPrompt.experience(context(record, child, state), timeLabel(start), timeLabel(entryTime))));
				if (!session.valid()) return false;
				if (!nonempty(answer.content)) throw new Error("新经历为空或格式不正确，请重试。");
				state.experiences.push({ start, end: entryTime, content: answer.content });
			}
			if (!session.valid()) return false;
			state.lastContactAt = Math.max(entryTime, Number(state.lastSentAt) || 0);
			if (state.experiences.length > config.experienceLimit) {
				try {
					const entries = compactResult(await request("experience", window.EdenChatPrompt.compact(state.experiences)), state.experiences);
					if (!session.valid()) return false;
					state.experiences = entries;
					state.memoryError = null;
				} catch (error) {
					if (!session.valid()) return false;
					state.memoryError = error.message;
				}
			}
			return true;
		}
		async function drain() {
			if (session.busy || !session.ready || !session.valid() || state.error) return;
			session.busy = true;
			try {
				while ((state.incoming.length || state.outbox.length) && session.valid()) {
					if (state.incoming.length) {
						const content = state.incoming[0];
						await new Promise(resolve => setTimeout(resolve, replyDelay(content)));
						if (!session.valid()) return;
						append(state, "you", content);
						state.incoming.shift();
						refresh();
						continue;
					}
					const batch = state.outbox[0];
					const unsentIds = new Set(state.outbox.flat().map(item => item.id));
					const history = state.history.filter(item => !unsentIds.has(item.id));
					const reply = parseReply(await request("conversation", window.EdenChatPrompt.conversation(context(record, child, state), history, batch)));
					if (!session.valid()) return;
					state.incoming.push(...reply.reply_content);
					state.outbox.shift();
					state.lastReply = reply.is_reply;
					refresh();
				}
			} catch (error) { if (session.valid()) { state.error = error.message; refresh(); } }
			finally { session.busy = false; }
		}
		session.send = value => {
			if (!session.valid()) return false;
			const content = String(value || "").trim();
			if (!content || content.length > 10000) return false;
			if (typeof window.Time?.pass !== "function") {
				state.error = "游戏时间接口尚未就绪，消息未发送。";
				refresh();
				return false;
			}
			window.Time.pass(config.playerMessageSeconds);
			const message = append(state, "player", content);
			state.lastSentAt = message.time;
			if (session.ready) state.lastContactAt = message.time;
			if (!session.ready && state.outbox.length) state.outbox[0].push(message);
			else state.outbox.push([message]);
			refresh();
			void drain();
			return true;
		};
		session.retry = async () => {
			if (session.busy || !session.valid()) return;
			state.error = null;
			if (!session.ready) {
				session.busy = true;
				try { session.ready = await prepare(); }
				catch (error) { if (session.valid()) state.error = error.message; }
				finally { session.busy = false; refresh(); }
			}
			await drain();
		};
		session.retryMemory = async () => {
			if (session.busy || !session.ready || !session.valid()) return;
			session.busy = true;
			try {
				const entries = compactResult(await request("experience", window.EdenChatPrompt.compact(state.experiences)), state.experiences);
				if (session.valid()) { state.experiences = entries; state.memoryError = null; }
			} catch (error) { if (session.valid()) state.memoryError = error.message; }
			finally { session.busy = false; refresh(); }
			await drain();
		};
		// Reloaded/interrupted unsent messages form the first batch for this visit.
		if (state.outbox.length > 1) state.outbox = [state.outbox.flat()];
		session.done = session.retry();
		return session;
	}
	window.EdenChat = Object.freeze({ config, replyDelay, now, timeLabel, eligible, ensure, identity, saveCards, context, parseReply, compactResult, open });
})();
