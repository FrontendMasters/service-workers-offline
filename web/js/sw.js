"use strict";

var version = 7;
var isOnline = true;
var isLoggedIn = false;
var cacheName = `ramblings-${version}`;
var allPostsCaching = false;

var urlsToCache = {
	loggedOut: [
		"/",
		"/about",
		"/contact",
		"/404",
		"/login",
		"/offline",
		"/css/style.css",
		"/js/blog.js",
		"/js/home.js",
		"/js/login.js",
		"/js/add-post.js",
		"/images/logo.gif",
		"/images/offline.png"
	]
};

self.addEventListener("install",onInstall);
self.addEventListener("activate",onActivate);
self.addEventListener("message",onMessage);
self.addEventListener("fetch",onFetch);

main().catch(console.error);


// ****************************

async function main() {
	await sendMessage({ statusUpdateRequest: true });
	await cacheLoggedOutFiles();
	return cacheAllPosts();
}

function onInstall(evt) {
	console.log(`Service Worker (v${version}) installed`);
	self.skipWaiting();
}

function onActivate(evt) {
	evt.waitUntil(handleActivation());
}

async function handleActivation() {
	await clearCaches();
	await cacheLoggedOutFiles(/*forceReload=*/true);
	await clients.claim();
	console.log(`Service Worker (v${version}) activated`);

	// spin off background caching of all past posts (over time)
	cacheAllPosts(/*forceReload=*/true).catch(console.error);
}

async function clearCaches() {
	var cacheNames = await caches.keys();
	var oldCacheNames = cacheNames.filter(function matchOldCache(cacheName){
		var [,cacheNameVersion] = cacheName.match(/^ramblings-(\d+)$/) || [];
		cacheNameVersion = cacheNameVersion != null ? Number(cacheNameVersion) : cacheNameVersion;
		return (
			cacheNameVersion > 0 &&
			version !== cacheNameVersion
		);
	});
	await Promise.all(
		oldCacheNames.map(function deleteCache(cacheName){
			return caches.delete(cacheName);
		})
	);
}

async function cacheLoggedOutFiles(forceReload = false) {
	var cache = await caches.open(cacheName);

	return Promise.all(
		urlsToCache.loggedOut.map(async function requestFile(url){
			try {
				let res;

				if (!forceReload) {
					res = await cache.match(url);
					if (res) {
						return;
					}
				}

				let fetchOptions = {
					method: "GET",
					cache: "no-store",
					credentials: "omit"
				};
				res = await fetch(url,fetchOptions);
				if (res.ok) {
					return cache.put(url,res);
				}
			}
			catch (err) {}
		})
	);
}

async function cacheAllPosts(forceReload = false) {
	// already caching the posts?
	if (allPostsCaching) {
		return;
	}
	allPostsCaching = true;
	await delay(5000);

	var cache = await caches.open(cacheName);
	var postIDs;

	try {
		if (isOnline) {
			let fetchOptions = {
				method: "GET",
				cache: "no-store",
				credentials: "omit"
			};
			let res = await fetch("/api/get-posts",fetchOptions);
			if (res && res.ok) {
				await cache.put("/api/get-posts",res.clone());
				postIDs = await res.json();
			}
		}
		else {
			let res = await cache.match("/api/get-posts");
			if (res) {
				let resCopy = res.clone();
				postIDs = await res.json();
			}
			// caching not started, try to start again (later)
			else {
				allPostsCaching = false;
				return cacheAllPosts(forceReload);
			}
		}
	}
	catch (err) {
		console.error(err);
	}

	if (postIDs && postIDs.length > 0) {
		return cachePost(postIDs.shift());
	}
	else {
		allPostsCaching = false;
	}


	// *************************

	async function cachePost(postID) {
		var postURL = `/post/${postID}`;
		var needCaching = true;

		if (!forceReload) {
			let res = await cache.match(postURL);
			if (res) {
				needCaching = false;
			}
		}

		if (needCaching) {
			await delay(10000);
			if (isOnline) {
				try {
					let fetchOptions = {
						method: "GET",
						cache: "no-store",
						credentials: "omit"
					};
					let res = await fetch(postURL,fetchOptions);
					if (res && res.ok) {
						await cache.put(postURL,res.clone());
						needCaching = false;
					}
				}
				catch (err) {}
			}

			// failed, try caching this post again?
			if (needCaching) {
				return cachePost(postID);
			}
		}

		// any more posts to cache?
		if (postIDs.length > 0) {
			return cachePost(postIDs.shift());
		}
		else {
			allPostsCaching = false;
		}
	}
}

async function sendMessage(msg) {
	var allClients = await clients.matchAll({ includeUncontrolled: true, });
	return Promise.all(
		allClients.map(function sendTo(client){
			var chan = new MessageChannel();
			chan.port1.onmessage = onMessage;
			return client.postMessage(msg,[chan.port2]);
		})
	);
}

function onMessage({ data }) {
	if ("statusUpdate" in data) {
		({ isOnline, isLoggedIn } = data.statusUpdate);
		console.log(`Service Worker (v${version}) status update... isOnline:${isOnline}, isLoggedIn:${isLoggedIn}`);
	}
}

function onFetch(evt) {
	evt.respondWith(router(evt.request));
}

async function router(req) {
	var url = new URL(req.url);
	var reqURL = url.pathname;
	var cache = await caches.open(cacheName);

	// request for site's own URL?
	if (url.origin == location.origin) {
		// are we making an API request?
		if (/^\/api\/.+$/.test(reqURL)) {
			let fetchOptions = {
				credentials: "same-origin",
				cache: "no-store"
			};
			let res = await safeRequest(reqURL,req,fetchOptions,/*cacheResponse=*/false,/*checkCacheFirst=*/false,/*checkCacheLast=*/true,/*useRequestDirectly=*/true);
			if (res) {
				if (req.method == "GET") {
					await cache.put(reqURL,res.clone());
				}
				return res;
			}

			return notFoundResponse();
		}
		// are we requesting a page?
		else if (req.headers.get("Accept").includes("text/html")) {
			// login-aware requests?
			if (/^\/(?:login|logout|add-post)$/.test(reqURL)) {
				let res;

				if (reqURL == "/login") {
					if (isOnline) {
						let fetchOptions = {
							method: req.method,
							headers: req.headers,
							credentials: "same-origin",
							cache: "no-store",
							redirect: "manual"
						};
						res = await safeRequest(reqURL,req,fetchOptions);
						if (res) {
							if (res.type == "opaqueredirect") {
								return Response.redirect("/add-post",307);
							}
							return res;
						}
						if (isLoggedIn) {
							return Response.redirect("/add-post",307);
						}
						res = await cache.match("/login");
						if (res) {
							return res;
						}
						return Response.redirect("/",307);
					}
					else if (isLoggedIn) {
						return Response.redirect("/add-post",307);
					}
					else {
						res = await cache.match("/login");
						if (res) {
							return res;
						}
						return cache.match("/offline");
					}
				}
				else if (reqURL == "/logout") {
					if (isOnline) {
						let fetchOptions = {
							method: req.method,
							headers: req.headers,
							credentials: "same-origin",
							cache: "no-store",
							redirect: "manual"
						};
						res = await safeRequest(reqURL,req,fetchOptions);
						if (res) {
							if (res.type == "opaqueredirect") {
								return Response.redirect("/",307);
							}
							return res;
						}
						if (isLoggedIn) {
							isLoggedIn = false;
							await sendMessage("force-logout");
							await delay(100);
						}
						return Response.redirect("/",307);
					}
					else if (isLoggedIn) {
						isLoggedIn = false;
						await sendMessage("force-logout");
						await delay(100);
						return Response.redirect("/",307);
					}
					else {
						return Response.redirect("/",307);
					}
				}
				else if (reqURL == "/add-post") {
					if (isOnline) {
						let fetchOptions = {
							method: req.method,
							headers: req.headers,
							credentials: "same-origin",
							cache: "no-store"
						};
						res = await safeRequest(reqURL,req,fetchOptions,/*cacheResponse=*/true);
						if (res) {
							return res;
						}
						res = await cache.match(
							isLoggedIn ? "/add-post" : "/login"
						);
						if (res) {
							return res;
						}
						return Response.redirect("/",307);
					}
					else if (isLoggedIn) {
						res = await cache.match("/add-post");
						if (res) {
							return res;
						}
						return cache.match("/offline");
					}
					else {
						res = await cache.match("/login");
						if (res) {
							return res;
						}
						return cache.match("/offline");
					}
				}
			}
			// otherwise, just use "network-and-cache"
			else {
				let fetchOptions = {
					method: req.method,
					headers: req.headers,
					cache: "no-store"
				};
				let res = await safeRequest(reqURL,req,fetchOptions,/*cacheResponse=*/false,/*checkCacheFirst=*/false,/*checkCacheLast=*/true);
				if (res) {
					if (!res.headers.get("X-Not-Found")) {
						await cache.put(reqURL,res.clone());
					}
					return res;
				}

				// otherwise, return an offline-friendly page
				return cache.match("/offline");
			}
		}
		// all other files use "cache-first"
		else {
			let fetchOptions = {
				method: req.method,
				headers: req.headers,
				cache: "no-store"
			};
			let res = await safeRequest(reqURL,req,fetchOptions,/*cacheResponse=*/true,/*checkCacheFirst=*/true);
			if (res) {
				return res;
			}

			// otherwise, force a network-level 404 response
			return notFoundResponse();
		}
	}
}

async function safeRequest(reqURL,req,options,cacheResponse = false,checkCacheFirst = false,checkCacheLast = false,useRequestDirectly = false) {
	var cache = await caches.open(cacheName);
	var res;

	if (checkCacheFirst) {
		res = await cache.match(reqURL);
		if (res) {
			return res;
		}
	}

	if (isOnline) {
		try {
			if (useRequestDirectly) {
				res = await fetch(req,options);
			}
			else {
				res = await fetch(req.url,options);
			}

			if (res && (res.ok || res.type == "opaqueredirect")) {
				if (cacheResponse) {
					await cache.put(reqURL,res.clone());
				}
				return res;
			}
		}
		catch (err) {}
	}

	if (checkCacheLast) {
		res = await cache.match(reqURL);
		if (res) {
			return res;
		}
	}
}

function notFoundResponse() {
	return new Response("",{
		status: 404,
		statusText: "Not Found"
	});
}

function delay(ms) {
	return new Promise(function c(res){
		setTimeout(res,ms);
	});
}
