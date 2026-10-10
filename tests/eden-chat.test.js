const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture({ background = "已在外地行医，住在合租公寓。", gap = 0, manualTimers = false } = {}) {
	const record = { childId: "c", bodyForm: "humanoid", innate: {}, training: { skills: {} }, affection: 80,
		adult: { settled: true, contactStatus: "active", career: "doctor", destination: "away" },
		chat: { background, lastContactAt: 864000 - gap } };
	const variables = { eden: { selectedChildId: "c", children: { c: record } } }, requests = [];
	const window = { SugarCube: { State: { variables, passage: "Eden Chat" } }, Time: { days: 10, hour: 0, minute: 0 },
		EdenChildData: { get: id => id === "c" ? { name: "琳" } : null },
		EdenAdult: { config: { universityCareers: { doctor: { label: "医生" } } } },
		EdenLifeStory: { buildSnapshot: () => ({ name: "琳", gender: "女性", species: "狐狸", pcParentRole: "mother", innate: {}, skills: {}, affectionToYou: 80 }) },
		EdenLLM: { getChatSettings: async kind => ({ kind, enabled: true }), isConfigured: () => true,
			chat: (messages, options) => { const d = deferred(); requests.push({ messages, options, ...d }); return d.promise; } } };
	const timers = [], passes = [];
	window.Time.pass = seconds => {
		passes.push(seconds);
		if (window.Time.date) window.Time.date.timeStamp += seconds;
		else window.Time.minute += seconds / 60;
	};
	const context = vm.createContext({ window, setTimeout: (callback, ms) => {
		if (manualTimers) timers.push({ callback, ms }); else queueMicrotask(callback);
	} });
	for (const name of ["eden-chat-prompt", "eden-chat"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules", `${name}.js`), "utf8"), context);
	const answer = async (index, value) => { requests[index].resolve({ text: JSON.stringify(value) }); await tick(); };
	return { window, record, variables, requests, timers, passes, api: window.EdenChat, answer };
}

for (const gap of [0, 7199, 7200]) test(`gap ${gap}s does not generate an experience`, async () => {
	const f = fixture({ gap }); await f.api.open("c").done;
	assert.equal(f.requests.length, 0);
	assert.equal(f.record.chat.lastContactAt, 864000);
});

test("over two hours generates once, queues multiple messages, then batches one conversation", async () => {
	const f = fixture({ gap: 7201 }); const session = f.api.open("c"); await tick();
	assert.equal(f.requests[0].options.settings.kind, "experience");
	session.send("今天好吗"); session.send("我刚刚回到家");
	assert.equal(f.requests.length, 1);
	await f.answer(0, { content: "上午值班，刚刚回家休息。" });
	assert.equal(f.requests.length, 2);
	const prompt = f.requests[1].messages[1].content;
	assert.equal(prompt.split("今天好吗").length, 2);
	assert.ok(prompt.includes("我刚刚回到家"));
	await f.answer(1, { is_reply: "yes", reply_content: ["挺好的", "刚下班呢"] });
	assert.equal(f.record.chat.history.length, 4);
	assert.equal(f.record.chat.outbox.length, 0);
	assert.equal(f.record.chat.experiences.length, 1);
	session.send("早点休息"); await tick();
	assert.equal(f.requests.length, 3);
	await f.answer(2, { is_reply: "no", reply_content: [] });
	assert.equal(f.record.chat.history.length, 5);
});

test("first visit foundation includes letter and does not generate a second gap", async () => {
	const f = fixture({ background: "", gap: 86400 });
	f.record.adult.lifeStory = { content: { dailyLife: "在医院工作。" } };
	const session = f.api.open("c"); await tick();
	assert.ok(f.requests[0].messages[1].content.includes("在医院工作"));
	await f.answer(0, { background: "在医院工作，独居。" }); await session.done;
	assert.equal(f.requests.length, 1);
	assert.equal(f.record.chat.background, "在医院工作，独居。");
});

test("experience failure does not advance time or lose queued messages; retry succeeds", async () => {
	const f = fixture({ gap: 10000 }); const session = f.api.open("c"); await tick();
	session.send("你好"); f.requests[0].reject(new Error("断线")); await session.done;
	assert.equal(f.record.chat.lastContactAt, 854000);
	assert.equal(f.record.chat.history.length, 1);
	const retry = session.retry(); await tick();
	await f.answer(1, { content: "今日正常上班。" });
	await f.answer(2, { is_reply: "yes", reply_content: ["你好呀"] }); await retry;
	assert.equal(f.record.chat.history.length, 2);
	assert.equal(f.record.chat.outbox.length, 0);
});

test("normal concurrent sends serialize, with previous reply available to next request", async () => {
	const f = fixture(); const session = f.api.open("c"); await session.done;
	session.send("第一条"); session.send("第二条"); await tick();
	assert.equal(f.requests.length, 1);
	assert.ok(!f.requests[0].messages[1].content.includes("第二条"));
	await f.answer(0, { is_reply: "yes", reply_content: ["第一条的回答"] });
	assert.equal(f.requests.length, 2);
	assert.ok(f.requests[1].messages[1].content.includes("第一条的回答"));
	assert.equal(f.requests[1].messages[1].content.split("第二条").length, 2);
	await f.answer(1, { is_reply: "no", reply_content: [] });
});

test("load/undo ignores stale response even when state carries same data", async () => {
	const f = fixture({ background: "" }); const session = f.api.open("c"); await tick();
	f.window.SugarCube.State.variables = JSON.parse(JSON.stringify(f.variables));
	await f.answer(0, { background: "不应保存" }); await session.done;
	assert.equal(f.record.chat.background, "");
	assert.equal(f.window.SugarCube.State.variables.eden.children.c.chat.background, "");
});

test("leaving page discards pending reply without losing player message", async () => {
	const f = fixture(); const session = f.api.open("c"); await session.done;
	session.send("测试"); await tick();
	f.window.SugarCube.State.passage = "Eden Contacts";
	await f.answer(0, { is_reply: "yes", reply_content: ["不应写入"] });
	assert.equal(f.record.chat.history.length, 1);
	assert.equal(f.record.chat.outbox.length, 1);
});

test("history stays at 50 while queued messages are retained independently", async () => {
	const f = fixture({ gap: 7201 }); const session = f.api.open("c"); await tick();
	for (let i = 0; i < 60; i++) session.send(`消息${i}`);
	assert.equal(f.record.chat.history.length, 50);
	assert.equal(f.record.chat.outbox[0].length, 60);
	await f.answer(0, { content: "正常上班。" });
	assert.ok(f.requests[1].messages[1].content.includes("消息0"));
	await f.answer(1, { is_reply: "yes", reply_content: ["知道了"] });
	assert.equal(f.record.chat.history.length, 50);
	assert.equal(f.record.chat.outbox.length, 0);
});

test("overflow compacts to validated records atomically, failure preserves 51 records", async () => {
	const f = fixture({ gap: 7201 });
	f.record.chat.experiences = Array.from({ length: 50 }, (_, i) => ({ start: i * 100, end: i * 100 + 50, content: `经历${i}` }));
	const session = f.api.open("c"); await tick();
	await f.answer(0, { content: "新经历" });
	assert.equal(f.requests.length, 2);
	await f.answer(1, { experiences: [] }); await session.done;
	assert.equal(f.record.chat.experiences.length, 51);
	assert.ok(f.record.chat.memoryError);
	const retry = session.retryMemory(); await tick();
	await f.answer(2, { experiences: [{ start: 0, end: 864000, content: "重要事实与新经历。" }] }); await retry;
	assert.equal(f.record.chat.experiences.length, 1);
	assert.equal(f.record.chat.memoryError, null);
});

test("bad conversation JSON can be retried without duplicating player messages", async () => {
	const f = fixture(); const session = f.api.open("c"); await session.done;
	session.send("你好"); await tick();
	await f.answer(0, { is_reply: "no", reply_content: ["错误"] });
	assert.equal(f.record.chat.history.length, 1);
	assert.ok(f.record.chat.error);
	const retry = session.retry(); await tick();
	await f.answer(1, { is_reply: "yes", reply_content: ["你好"] }); await retry;
	assert.equal(f.record.chat.history.length, 2);
});

test("character cards persist independently and established career is preserved", async () => {
	const f = fixture(); f.api.saveCards("c", { name: "家长甲", profile: "喜欢看书" }, "说话简短");
	const session = f.api.open("c"); await session.done;
	session.send("在忙什么"); await tick();
	const text = f.requests[0].messages.map(m => m.content).join("\n");
	for (const item of ["家长甲", "喜欢看书", "说话简短", "妈妈", "医生", "【当前新消息】"]) assert.ok(text.includes(item));
	await f.answer(0, { is_reply: "no", reply_content: [] });
});

test("lost contact and animals cannot start adult chat", () => {
	const f = fixture(); f.record.adult.contactStatus = "lost";
	assert.throws(() => f.api.open("c"), /无法联系/);
	f.record.adult.contactStatus = "active"; f.record.bodyForm = "beast";
	assert.throws(() => f.api.open("c"), /无法联系/);
});

test("native game timestamp handles midnight independently of Time.days rollover", async () => {
	const f = fixture();
	f.window.Time.date = { timeStamp: 9000000 };
	f.record.chat.lastContactAt = 9000000 - 7200;
	f.window.Time.days = 10; f.window.Time.hour = 0;
	await f.api.open("c").done;
	assert.equal(f.api.now(), 9000000);
	assert.equal(f.requests.length, 0);
	assert.equal(f.record.chat.lastContactAt, 9000000);
});

test("shared HTTP client uses the supplied model without enabling life letters", async () => {
	const calls = [], window = {};
	const context = vm.createContext({ window, AbortController, setTimeout, clearTimeout, URL,
		console: { warn() {} },
		fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"is_reply":"no","reply_content":[]}' } }] }) }; } });
	vm.runInContext(fs.readFileSync(path.join(__dirname, "../mods/FertilityExpansion/modules/eden-llm.js"), "utf8"), context);
	await window.EdenLLM.ready;
	assert.equal((await window.EdenLLM.getSettings()).enabled, false);
	await window.EdenLLM.chat([{ role: "user", content: "test" }], { settings: { enabled: true, apiUrl: "https://example.invalid/v1", apiKey: "test-placeholder", modelName: "chat-model" }, jsonObject: true });
	assert.equal(calls[0].url, "https://example.invalid/v1/chat/completions");
	assert.equal(JSON.parse(calls[0].init.body).model, "chat-model");
	assert.equal(JSON.parse(calls[0].init.body).response_format.type, "json_object");
	assert.equal((await window.EdenLLM.getSettings()).enabled, false);
});

test("changing the selected child rejects a pending response", async () => {
	const f = fixture(); const session = f.api.open("c"); await session.done;
	session.send("原孩子的消息"); await tick();
	f.variables.eden.selectedChildId = "another-child";
	await f.answer(0, { is_reply: "yes", reply_content: ["不能串线"] });
	assert.equal(f.record.chat.history.length, 1);
	assert.equal(f.record.chat.outbox.length, 1);
});

test("replies appear one at a time after length-based real-time delays, without passing game time", async () => {
	const f = fixture({ manualTimers: true }); const session = f.api.open("c"); await session.done;
	session.send("你好"); await tick();
	assert.deepEqual(f.passes, [60]);
	await f.answer(0, { is_reply: "yes", reply_content: ["嗯", "今天在医院忙了一整天"] });
	assert.equal(f.record.chat.history.length, 1);
	assert.equal(f.timers.length, 1);
	assert.equal(f.timers[0].ms, 800);
	f.timers.shift().callback(); await tick();
	assert.equal(f.record.chat.history.length, 2);
	assert.equal(f.record.chat.history[1].content, "嗯");
	assert.ok(f.timers[0].ms > 800);
	f.timers.shift().callback(); await tick();
	assert.equal(f.record.chat.history.length, 3);
	assert.equal(f.record.chat.incoming.length, 0);
	assert.deepEqual(f.passes, [60]);
	assert.equal(f.api.replyDelay("很".repeat(1000)), 5000);
	assert.equal(f.api.replyDelay("🐈".repeat(4)), 960);
});

test("each queued send costs one minute, invalid sends and retries cost none", async () => {
	const f = fixture({ gap: 8000 }); const session = f.api.open("c"); await tick();
	assert.equal(session.send("   "), false);
	assert.equal(session.send("a".repeat(10001)), false);
	session.send("第一条"); session.send("第二条");
	assert.deepEqual(f.passes, [60, 60]);
	assert.equal(f.record.chat.history[1].time - f.record.chat.history[0].time, 60);
	f.requests[0].reject(new Error("断线")); await session.done;
	const retry = session.retry(); await tick();
	await f.answer(1, { content: "今天读书了。" });
	await f.answer(2, { is_reply: "no", reply_content: [] }); await retry;
	assert.deepEqual(f.passes, [60, 60]);
	assert.equal(f.record.chat.lastContactAt, f.api.now());
});

test("saved delayed replies resume after load without a second model call or stale timer writes", async () => {
	const f = fixture({ manualTimers: true }); const session = f.api.open("c"); await session.done;
	session.send("你好"); await tick();
	await f.answer(0, { is_reply: "yes", reply_content: ["第一句", "第二句"] });
	f.timers.shift().callback(); await tick();
	const loaded = JSON.parse(JSON.stringify(f.variables));
	f.window.SugarCube.State.variables = loaded;
	const resumed = f.api.open("c"); await tick();
	f.timers.shift().callback(); await tick(); // stale timer from before loading
	assert.equal(loaded.eden.children.c.chat.history.length, 2);
	f.timers.shift().callback(); await resumed.done;
	assert.equal(loaded.eden.children.c.chat.history.length, 3);
	assert.equal(loaded.eden.children.c.chat.history[2].content, "第二句");
	assert.equal(f.requests.length, 1);
	assert.deepEqual(f.passes, [60]);
});
