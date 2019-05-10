(function Blog(){
	"use strict";

	var offlineIcon;
	var isOnline = ("onLine" in navigator) && navigator.onLine;
	var isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");

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

})();
