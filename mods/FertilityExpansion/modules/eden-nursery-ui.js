;(() => {
	"use strict";
	let observer;
	function sync(root = document) {
		const activities = new Map();
		root.querySelectorAll(".eden-child-activity[data-eden-activity-child]").forEach(activity => {
			// Read the actual rendered actions, after native activity updates and
			// random choices. State flags alone do not guarantee a usable link.
			const links = [...activity.querySelectorAll("a.link-internal, button")];
			const available = links.some(link => !link.disabled && !link.closest('[hidden], .hidden, .disabled, [aria-disabled="true"]'));
			activities.set(activity.dataset.edenActivityChild, available);
		});
		const hideOutline = window.SugarCube?.State?.variables?.options?.eden?.showHallHotspots === false;
		root.querySelectorAll("[data-eden-hotspot-child]").forEach(hotspot => {
			hotspot.hidden = activities.get(hotspot.dataset.edenHotspotChild) !== true;
			hotspot.classList.toggle("eden-child-outline-hidden", hideOutline);
		});
	}
	function refresh() {
		observer?.disconnect();
		const passage = document.getElementById("passages");
		if (!passage) return;
		sync(passage);
		observer = new MutationObserver(() => sync(passage));
		// Watch the source list, not the scene we update, to avoid feedback loops.
		const viewer = passage.querySelector("#childViewer");
		if (viewer) observer.observe(viewer, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "disabled", "aria-disabled"] });
	}
	window.EdenNurseryUi = Object.freeze({ sync });
	$(document).on(":passagedisplay.edenNursery", refresh);
})();
