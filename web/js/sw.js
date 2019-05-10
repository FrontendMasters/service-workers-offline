"use strict";

var version = 5;
var isOnline = true;
var isLoggedIn = false;
var cacheName = `ramblings-${version}`;

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
			let res;

			if (isOnline) {
				try {
					let fetchOptions = {
						method: req.method,
						headers: req.headers,
						credentials: "same-origin",
						cache: "no-store",
					};
					res = await fetch(req.url,fetchOptions);
					if (res && res.ok) {
						if (req.method == "GET") {
							await cache.put(reqURL,res.clone());
						}
						return res;
					}
				}
				catch (err) {}
			}

			res = await cache.match(reqURL);
			if (res) {
				return res;
			}

			return notFoundResponse();
		}
		// are we requesting a page?
		else if (req.headers.get("Accept").includes("text/html")) {
			// login-aware requests?
			if (/^\/(?:login|logout|add-post)$/.test(reqURL)) {
				// TODO
			}
			// otherwise, just use "network-and-cache"
			else {
				let res;

				if (isOnline) {
					try {
						let fetchOptions = {
							method: req.method,
							headers: req.headers,
							cache: "no-store",
						};
						res = await fetch(req.url,fetchOptions);
						if (res && res.ok) {
							if (!res.headers.get("X-Not-Found")) {
								await cache.put(reqURL,res.clone());
							}
							return res;
						}
					}
					catch (err) {}
				}

				// fetch failed, so try the cache
				res = await cache.match(reqURL);
				if (res) {
					return res;
				}

				// otherwise, return an offline-friendly page
				return cache.match("/offline");
			}
		}
		// all other files use "cache-first"
		else {
			let res = await cache.match(reqURL);
			if (res) {
				return res;
			}
			else {
				if (isOnline) {
					try {
						let fetchOptions = {
							method: req.method,
							headers: req.headers,
							cache: "no-store",
						};
						res = await fetch(req.url,fetchOptions);
						if (res && res.ok) {
							await cache.put(reqURL,res.clone());
							return res;
						}
					}
					catch (err) {}
				}

				// otherwise, force a network-level 404 response
				return notFoundResponse();
			}
		}
	}
}

function notFoundResponse() {
	return new Response("",{
		status: 404,
		statusText: "Not Found"
	});
}
