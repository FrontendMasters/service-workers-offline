"use strict";

var version = 1;

self.addEventListener("install",onInstall);
self.addEventListener("activate",onActivate);

main().catch(console.error);


// ****************************

async function main() {
	console.log(`Service Worker (v${version}) started`);
}

function onInstall(evt) {
	console.log(`Service Worker (v${version}) installed`);
	self.skipWaiting();
}

function onActivate(evt) {
	evt.waitUntil(handleActivation());
}

async function handleActivation() {
	await clients.claim();
	console.log(`Service Worker (v${version}) activated`);
}
