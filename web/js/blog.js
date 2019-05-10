(function Blog(){
	"use strict";

	var offlineIcon;
	var isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");

	document.addEventListener("DOMContentLoaded",ready,false);


	// **********************************

	function ready() {
		offlineIcon = document.getElementById("connectivity-status");
	}

})();
