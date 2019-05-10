(function Login(){
	"use strict";

	var usernameInput;
	var passwordInput;
	var loginBtn;

	document.addEventListener("DOMContentLoaded",ready,false);


	// **********************************

	function ready() {
		usernameInput = document.getElementById("login-username");
		passwordInput = document.getElementById("login-password");
		loginBtn = document.getElementById("btn-login");

		loginBtn.addEventListener("click",tryLogin,false);
	}

	async function tryLogin() {
		if (
			usernameInput.value.length > 3 &&
			passwordInput.value.length > 7
		) {
			try {
				let res = await fetch("/api/login",{
					method: "POST",
					credentials: "same-origin",
					body: JSON.stringify({
						username: usernameInput.value,
						password: passwordInput.value
					})
				});

				if (res && res.ok) {
					let result = await res.json();
					usernameInput.value = "";
					passwordInput.value = "";
					if (result.OK) {
						if (document.location.href == "/add-post") {
							document.location.reload();
						}
						else {
							document.location.href = "/add-post";
						}
						return;
					}
				}
			}
			catch (err) {
				console.error(err);
			}

			alert("Login failed. Try again.");
		}
		else {
			alert("Please enter a sufficient username and password.");
		}
	}

})();
