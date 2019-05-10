(function Blog(){
	"use strict";

	var offlineIcon;
	var isOnline = ("onLine" in navigator) && navigator.onLine;
	var isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");
	var usingSW = ("serviceWorker" in navigator);
	var swRegistration;
	var svcworker;

	if (usingSW) {
		initServiceWorker().catch(console.error);
	}

	document.addEventListener("DOMContentLoaded",ready,false);


	// **********************************

	function ready() {
		offlineIcon = document.getElementById("connectivity-status");

		if (!isOnline) {
			offlineIcon.classList.remove("hidden");
		}

		window.addEventListener("online",function online(){
			offlineIcon.classList.add("hidden");
			isOnline = true;
			sendStatusUpdate();
		},false);
		window.addEventListener("offline",function offline(){
			offlineIcon.classList.remove("hidden");
			isOnline = false;
			sendStatusUpdate();
		},false);
	}

	async function initServiceWorker() {
		swRegistration = await navigator.serviceWorker.register("/sw.js",{
			updateViaCache: "none",
		});

		svcworker = swRegistration.installing || swRegistration.waiting || swRegistration.active;
		sendStatusUpdate(svcworker);

		// listen for new service worker to take over
		navigator.serviceWorker.addEventListener("controllerchange",async function onController(){
			svcworker = navigator.serviceWorker.controller;
			sendStatusUpdate(svcworker);
		});

		navigator.serviceWorker.addEventListener("message",onSWMessage,false);
	}

	function onSWMessage(evt) {
		var { data } = evt;
		if (data.statusUpdateRequest) {
			console.log("Status update requested from service worker, responding...");
			sendStatusUpdate(evt.ports && evt.ports[0]);
		}
		else if (data == "force-logout") {
			document.cookie = "isLoggedIn=";
			isLoggedIn = false;
			sendStatusUpdate();
		}
	}

	function sendStatusUpdate(target) {
		sendSWMessage({ statusUpdate: { isOnline, isLoggedIn } },target);
	}

	function sendSWMessage(msg,target) {
		if (target) {
			target.postMessage(msg);
		}
		else if (svcworker) {
			svcworker.postMessage(msg);
		}
		else if (navigator.serviceWorker.controller) {
			navigator.serviceWorker.controller.postMessage(msg);
		}
	}

})();
