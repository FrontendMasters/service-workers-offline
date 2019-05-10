(function AddPost(){
	"use strict";

	var titleInput;
	var postInput;
	var addPostBtn;

	document.addEventListener("DOMContentLoaded",ready,false);


	// **********************************

	function ready() {
		titleInput = document.getElementById("new-title");
		postInput = document.getElementById("new-post");
		addPostBtn = document.getElementById("btn-add-post");

		addPostBtn.addEventListener("click",addPost,false);
	}

	async function addPost() {
		if (
			titleInput.value.length > 0 &&
			postInput.value.length > 0
		) {
			try {
				let res = await fetch("/api/add-post",{
					method: "POST",
					credentials: "same-origin",
					body: JSON.stringify({
						title: titleInput.value,
						post: postInput.value
					})
				});

				if (res && res.ok) {
					let result = await res.json();
					if (result.OK) {
						titleInput.value = "";
						postInput.value = "";
						document.location.href = `/post/${result.postID}`;
						return;
					}
				}
			}
			catch (err) {
				console.error(err);
			}

			alert("Posting failed. Try again.");
		}
		else {
			alert("Please enter a title and some blog post content.");
		}
	}

})();
