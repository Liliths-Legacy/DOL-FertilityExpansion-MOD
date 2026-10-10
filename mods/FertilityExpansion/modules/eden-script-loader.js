;(() => {
	"use strict";

	let status = "waiting";
	let isolatedCount = 0;
	let armed = false;
	// Keep SugarCube's normal script phase and lexical APIs (setup, Wikifier, etc.).
	// Only change the execution boundary: another mod's exception must not skip Eden.
	function isolate() {
		if (status === "isolated") return;
		const mod = window.modUtils?.getAnyModByNameNoAlias("FertilityExpansion");
		const files = mod?.bootJson?.scriptFileList;
		const combined = document.getElementById("twine-user-script");
		if (!Array.isArray(files) || !files.length || !combined?.parentNode) throw new Error("无法读取伊甸园普通脚本清单或游戏脚本节点。");
		const originals = new Map(mod.cache.scriptFileItems.items.map(item => [item.name, item.content]));
		const code = combined.textContent;
		const headers = Array.from(code.matchAll(/\/\* twine-user-script #(\d+): "([^"\n]+)" \*\//g));
		const selected = [];
		for (let i = 0; i < headers.length; i++) {
			const header = headers[i];
			const name = header[2];
			if (!files.includes(name)) continue;
			const end = headers[i + 1]?.index ?? code.length;
			const content = code.slice(header.index + header[0].length, end);
			// Refuse ambiguous/colliding files rather than moving another mod's code.
			if (typeof originals.get(name) !== "string" || content.trim() !== originals.get(name).trim()) throw new Error(`伊甸园脚本被合并或改写，无法独立加载：${name}`);
			selected.push({ name, start: header.index, end, content });
		}
		if (selected.length !== files.length || new Set(selected.map(item => item.name)).size !== files.length) throw new Error("伊甸园普通脚本缺失或重复，无法独立加载。");
		// Validate everything and create every node before changing the live source.
		const fragment = document.createDocumentFragment();
		for (const item of selected) {
			const script = document.createElement("script");
			script.setAttribute("type", "text/twine-javascript");
			script.setAttribute("role", "script");
			script.setAttribute("data-eden-module", item.name);
			script.textContent = item.content + `\n//# sourceURL=FertilityExpansion/${item.name}\n`;
			fragment.appendChild(script);
		}
		let remaining = code;
		for (const item of selected.slice().reverse()) {
			remaining = remaining.slice(0, item.start) + `;/* Eden isolated: ${item.name} */\n` + remaining.slice(item.end);
		}
		combined.textContent = remaining;
		combined.parentNode.appendChild(fragment);
		isolatedCount = selected.length;
		status = "isolated";
	}
	function install() {
		try { isolate(); }
		catch (error) {
			status = "failed";
			console.error("[FertilityExpansion] 独立脚本加载失败", error);
		}
	}
	window.EdenScriptLoader = Object.freeze({ install, status: () => status, count: () => isolatedCount });
	const controller = window.modSC2DataManager?.getModLoadController();
	if (typeof controller?.addLifeTimeCircleHook === "function") {
		controller.addLifeTimeCircleHook("FertilityExpansion.IsolatedScripts", { ModLoaderLoadEnd() {
			if (armed) return;
			const start = window.mainStart;
			if (typeof start !== "function") { status = "unsupported"; return; }
			armed = true;
			// Other LoadEnd hooks may still rewrite the DOM. The pinned ModLoader
			// calls mainStart after all hooks, immediately before Story.load().
			window.mainStart = function (...args) {
				install();
				return start.apply(this, args);
			};
		} });
	} else status = "unsupported";
})();
