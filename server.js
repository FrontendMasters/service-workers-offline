"use strict";

var util = require("util");
var fs = require("fs");
var path = require("path");
var http = require("http");
var nodeStaticAlias = require("node-static-alias");
var getStream = require("get-stream");
var cookie = require("cookie");
var rand = require("random-number-csprng");

var fsReadDir = util.promisify(fs.readdir);
var fsReadFile = util.promisify(fs.readFile);
var fsWriteFile = util.promisify(fs.writeFile);

const PORT = 8049;
const WEB_DIR = path.join(__dirname,"web");

var httpServer = http.createServer(handleRequest);

var staticServer = new nodeStaticAlias.Server(WEB_DIR,{
	serverInfo: "My Ramblings",
	cache: 1,
	alias: [
		{
			// basic static page friendly URL rewrites
			match: /^\/(?:index)?(?:[#?]|$)/,
			serve: "index.html",
			force: true,
		},
		{
			// basic static page friendly URL rewrites
			match: /^\/(?:about|contact|login|404|offline)(?:[#?]|$)/,
			serve: "<% basename %>.html",
			force: true,
		},
		{
			// URL rewrites for individual posts
			match: /^\/post\/[\w\d-]+(?:[#?]|$)/,
			serve: "posts/<% basename %>.html",
			force: true,
		},
		{
			// match (with force) static files
			match: /^\/(?:(?:(?:js|css|images)\/.+))$/,
			serve: ".<% reqPath %>",
			force: true,
		},
	],
});


httpServer.listen(PORT);
console.log(`Server started on http://localhost:${PORT}...`);


// *******************************

var sessions = [];

async function handleRequest(req,res) {
	// parse cookie values?
	if (req.headers.cookie) {
		req.headers.cookie = cookie.parse(req.headers.cookie);
	}

	// handle API calls
	if (
		["GET","POST"].includes(req.method) &&
		/^\/api\/.+$/.test(req.url)
	) {
		if (req.url == "/api/get-posts") {
			await getPosts(req,res);
			return;
		}
		else if (req.url == "/api/login") {
			let loginData = JSON.parse(await getStream(req));
			await doLogin(loginData,req,res);
			return;
		}
		else if (
			req.url == "/api/add-post" &&
			validateSessionID(req,res)
		) {
			let newPostData = JSON.parse(await getStream(req));
			await addPost(newPostData,req,res);
			return;
		}

		// didn't recognize the API request
		res.writeHead(404);
		res.end();
	}
	// handle all other file requests
	else if (["GET","HEAD"].includes(req.method)) {
		// special handling for empty favicon
		if (req.url == "/favicon.ico") {
			res.writeHead(204,{
				"Content-Type": "image/x-icon",
				"Cache-Control": "public, max-age: 604800"
			});
			res.end();
			return;
		}

		// special handling for service-worker (virtual path)
		if (/^\/sw\.js(?:[?#].*)?$/.test(req.url)) {
			serveFile("/js/sw.js",200,{ "cache-control": "max-age=0", },req,res)
			.catch(console.error);
			return;
		}

		// handle admin pages
		if (/^\/(?:add-post)(?:[#?]|$)/.test(req.url)) {
			// page not allowed without active session
			if (validateSessionID(req,res)) {
				await serveFile("/add-post.html",200,{},req,res);
			}
			// show the login page instead
			else {
				await serveFile("/login.html",200,{},req,res);
			}
			return;
		}

		// login page when already logged in?
		if (
			/^\/(?:login)(?:[#?]|$)/.test(req.url) &&
			validateSessionID(req,res)
		) {
			res.writeHead(307,{ Location: "/add-post", });
			res.end();
			return;
		}

		// handle logout
		if (/^\/(?:logout)(?:[#?]|$)/.test(req.url)) {
			clearSession(req,res);
			res.writeHead(307,{ Location: "/", });
			res.end();
			return;
		}

		// handle other static files
		staticServer.serve(req,res,function onStaticComplete(err){
			if (err) {
				if (req.headers["accept"].includes("text/html")) {
					serveFile("/404.html",200,{ "X-Not-Found": "1" },req,res)
					.catch(console.error);
				}
				else {
					res.writeHead(404);
					res.end();
				}
			}
		});
	}
	// Oops, invalid/unrecognized request
	else {
		res.writeHead(404);
		res.end();
	}
}

function serveFile(url,statusCode,headers,req,res) {
	var listener = staticServer.serveFile(url,statusCode,headers,req,res);
	return new Promise(function c(resolve,reject){
		listener.on("success",resolve);
		listener.on("error",reject);
	});
}

async function getPostIDs() {
	var files = await fsReadDir(path.join(WEB_DIR,"posts"));
	return (
		files
		.filter(function onlyPosts(filename){
			return /^\d+\.html$/.test(filename);
		})
		.map(function postID(filename){
			let [,postID] = filename.match(/^(\d+)\.html$/);
			return Number(postID);
		})
		.sort(function desc(x,y){
			return y - x;
		})
	);
}

async function getPosts(req,res) {
	var postIDs = await getPostIDs();
	sendJSONResponse(postIDs,res);
}

async function addPost(newPostData,req,res) {
	if (
		newPostData.title.length > 0 &&
		newPostData.post.length > 0
	) {
		let postTemplate = await fsReadFile(path.join(WEB_DIR,"posts","post.html"),"utf-8");
		let newPost =
			postTemplate
			.replace(/\{\{TITLE\}\}/g,newPostData.title)
			.replace(/\{\{POST\}\}/,newPostData.post);
		let postIDs = await getPostIDs();
		let newPostCount = 1;
		let [,year,month,day] = (new Date()).toISOString().match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (postIDs.length > 0) {
			let [,latestYear,latestMonth,latestDay,latestCount] = String(postIDs[0]).match(/^(\d{4})(\d{2})(\d{2})(\d+)/);
			if (
				latestYear == year &&
				latestMonth == month &&
				latestDay == day
			) {
				newPostCount = Number(latestCount) + 1;
			}
		}
		let newPostID = `${year}${month}${day}${newPostCount}`;
		try {
			await fsWriteFile(path.join(WEB_DIR,"posts",`${newPostID}.html`),newPost,"utf8");
			sendJSONResponse({ OK: true, postID: newPostID },res);
			return;
		}
		catch (err) {}
	}

	sendJSONResponse({ failed: true },res);
}

function validateSessionID(req,res) {
	if (req.headers.cookie && req.headers.cookie["sessionId"]) {
		let isLoggedIn = Number(req.headers.cookie["isLoggedIn"]);
		let sessionID = req.headers.cookie["sessionId"];
		let session;

		if (
			isLoggedIn == 1 &&
			sessions.includes(sessionID)
		) {
			req.sessionID = sessionID;

			// update cookie headers
			res.setHeader(
				"Set-Cookie",
				getCookieHeaders(sessionID,new Date(Date.now() + /*1 hour in ms*/3.6E5).toUTCString())
			);
			return true;
		}
		else {
			clearSession(req,res);
		}
	}

	return false;
}

async function randomString() {
	var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/";
	var str = "";
	for (let i = 0; i < 20; i++) {
		str += chars[ await rand(0,63) ];
	}
	return str;
}

async function createSession() {
	var sessionID;
	do {
		sessionID = await randomString();
	} while (sessions.includes(sessionID));
	sessions.push(sessionID);
	return sessionID;
}

function clearSession(req,res) {
	var sessionID =
		req.sessionID ||
		(req.headers.cookie && req.headers.cookie.sessionId);

	if (sessionID) {
		sessions = sessions.filter(function removeSession(sID){
			return sID !== sessionID;
		});
	}

	res.setHeader("Set-Cookie",getCookieHeaders(null,new Date(0).toUTCString()));
}

function getCookieHeaders(sessionID,expires = null) {
	var cookieHeaders = [
		`sessionId=${sessionID || ""}; HttpOnly; Path=/`,
		`isLoggedIn=${sessionID ? "1" : ""}; Path=/`,
	];

	if (expires != null) {
		cookieHeaders = cookieHeaders.map(function addExpires(headerVal){
			return `${headerVal}; Expires=${expires}`;
		});
	}

	return cookieHeaders;
}

async function doLogin(loginData,req,res) {
	// WARNING: This is absolutely NOT how you should handle logins,
	// having credentials hard-coded. Hash all credentials and store
	// them in a secure database.
	if (loginData.username == "admin" && loginData.password == "changeme") {
		let sessionID = await createSession();
		sendJSONResponse({ OK: true },res,{
			"Set-Cookie": getCookieHeaders(
				sessionID,
				new Date(Date.now() + /*1 hour in ms*/3.6E5).toUTCString()
			)
		});
	}
	else {
		sendJSONResponse({ failed: true },res);
	}
}

function sendJSONResponse(msg,res,otherHeaders = {}) {
	res.writeHead(200,{
		"Content-Type": "application/json",
		"Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
		...otherHeaders
	});
	res.end(JSON.stringify(msg));
}
