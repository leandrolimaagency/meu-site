/*
 * Instagram browser bridge for the free following importer.
 * Run this in the Instagram tab before opening the Following list.
 */
(function () {
  "use strict";

  if (window.__stalkeaFollowingBridge) {
    console.info("Stalkea bridge already running.");
    return;
  }
  window.__stalkeaFollowingBridge = true;

  var API_URL = "https://www.appstalai.site/api/network";
  var sent = new Set();
  var imported = 0;

  function profileUsername() {
    var parts = location.pathname.split("/").filter(Boolean);
    var candidate = parts[0] || "";
    if (/^(accounts|direct|explore|reels|stories|p|about|emails|web)$/i.test(candidate)) return "";
    return candidate.replace(/^@+/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30);
  }

  function sendUsers(payload, responseUrl) {
    var username = profileUsername();
    if (!username || !payload || !Array.isArray(payload.users)) return;
    if (!/\/friendships\/\d+\/following\//i.test(String(responseUrl || ""))) return;

    var following = payload.users.filter(function (user) {
      return user && typeof user.username === "string" && user.username.trim();
    }).map(function (user) {
      return {
        username: user.username,
        full_name: user.full_name,
        profile_pic_url: user.profile_pic_url || user.profile_pic_url_hd,
        is_private: user.is_private,
        is_verified: user.is_verified
      };
    });

    if (!following.length) return;
    var key = username.toLowerCase() + ":" + following.map(function (user) { return user.username; }).join(",");
    if (sent.has(key)) return;
    sent.add(key);

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, following: following })
    }).then(function (response) {
      if (!response.ok) throw new Error("import " + response.status);
      imported += following.length;
      console.info("Stalkea: imported " + following.length + " users (total " + imported + "). Scroll to load more.");
    }).catch(function (error) {
      console.warn("Stalkea: import failed", error.message || error);
    });
  }

  var originalFetch = window.fetch;
  window.fetch = function () {
    return originalFetch.apply(this, arguments).then(function (response) {
      var responseUrl = response && response.url;
      if (/\/friendships\/\d+\/following\//i.test(String(responseUrl || ""))) {
        response.clone().json().then(function (payload) {
          sendUsers(payload, responseUrl);
        }).catch(function () {});
      }
      return response;
    });
  };

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__stalkeaUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () {
      if (!/\/friendships\/\d+\/following\//i.test(String(this.__stalkeaUrl || ""))) return;
      try {
        sendUsers(JSON.parse(this.responseText), this.__stalkeaUrl);
      } catch (_) {}
    });
    return originalSend.apply(this, arguments);
  };

  console.info("Stalkea bridge active. Open the profile's Following list and scroll it.");
})();
