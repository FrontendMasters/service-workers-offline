(function Home(){
	"use strict";

	var postsList;

	document.addEventListener("DOMContentLoaded",ready,false);


	// **********************************

	function ready() {
		postsList = document.getElementById("my-posts");
		main().catch(console.error);
	}

	async function main() {
		var postIDs;

		try {
			var res = await fetch("/api/get-posts");
			if (res && res.ok) {
				postIDs = await res.json();
			}
		}
		catch (err) {}

		renderPostIDs(postIDs || []);
	}

	function renderPostIDs(postIDs) {
		if (postIDs.length > 0) {
			postsList.innerHTML = "";
			for (let postID of postIDs) {
				let [,year,month,day,postNum] = String(postID).match(/^(\d{4})(\d{2})(\d{2})(\d+)$/);
				let postEntry = document.createElement("li");
				postEntry.innerHTML = `<a href="/post/${postID}">Post-${+month}/${+day}/${year}-${postNum}</a>`;
				postsList.appendChild(postEntry);
			}
		}
		else {
			postsList.innerHTML = "<li>-- nothing yet, check back soon! --</li>";
		}
	}

})();
