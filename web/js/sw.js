"use strict";

var version = 3;
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
	await cacheLoggedOutFiles(/*forceReload=*/true);
	await clients.claim();
	console.log(`Service Worker (v${version}) activated`);
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
