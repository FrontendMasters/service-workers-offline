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
		},false);
		window.addEventListener("offline",function offline(){
			offlineIcon.classList.remove("hidden");
			isOnline = false;
		},false);
	}

	async function initServiceWorker() {
		swRegistration = await navigator.serviceWorker.register("/sw.js",{
			updateViaCache: "none",
		});

		svcworker = swRegistration.installing || swRegistration.waiting || swRegistration.active;

		// listen for new service worker to take over
		navigator.serviceWorker.addEventListener("controllerchange",async function onController(){
			svcworker = navigator.serviceWorker.controller;
		});
	}

})();
