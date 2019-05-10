"use strict";

var version = 2;
var isOnline = true;
var isLoggedIn = false;

self.addEventListener("install",onInstall);
self.addEventListener("activate",onActivate);
self.addEventListener("message",onMessage);

main().catch(console.error);


// ****************************

async function main() {
	await sendMessage({ statusUpdateRequest: true });
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
