(() => {
	"use strict";

	const tabAttribute = "data-eden-options-tab";

	function renderSettings() {
		const content = document.getElementById("customOverlayContent");
		const Wikifier = window.Wikifier || window.SugarCube?.Wikifier;
		if (!content || !Wikifier) return;
		content.replaceChildren();
		new Wikifier(content, "<<edenSettings>>");
		content.scrollTop = 0;
	}

	function ensureOptionsTab() {
		const overlay = document.getElementById("customOverlay");
		if (!overlay || overlay.dataset.overlay !== "options") return;
		const tabs = overlay.querySelector("#overlayTabs");
		if (!tabs || tabs.querySelector(`[${tabAttribute}]`)) return;

		const button = document.createElement("button");
		button.type = "button";
		button.setAttribute(tabAttribute, "");
		button.setAttribute("aria-label", "生育拓展");
		button.addEventListener("click", () => {
			tabs.querySelectorAll(":scope > button").forEach(tab => tab.classList.remove("tab-selected"));
			button.classList.add("tab-selected");
			renderSettings();
		});

		const existingButtons = tabs.querySelectorAll(":scope > button");
		const informationButton = existingButtons[existingButtons.length - 1];
		tabs.insertBefore(button, informationButton || null);
		tabs.addEventListener(
			"click",
			event => {
				if (event.target.closest("button") !== button) button.classList.remove("tab-selected");
			},
			true
		);
	}

	function startObserver() {
		ensureOptionsTab();
		const target = document.getElementById("customOverlay") || document.body;
		if (!target || target.dataset.edenOptionsObserved === "true") return;
		target.dataset.edenOptionsObserved = "true";
		new MutationObserver(ensureOptionsTab).observe(target, {
			attributes: true,
			attributeFilter: ["data-overlay"],
			childList: true,
			subtree: true,
		});
	}

	$(document).on(":storyready.edenOptions :passagedisplay.edenOptions", startObserver);
	startObserver();
})();
