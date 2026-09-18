/* =============================================================================
   FUNNEL — helpers compartilhados: @ do perfil, busca via Worker, back-redirect.
   ============================================================================= */
(function () {
  var CFG = window.STALKEA_CONFIG || {};
  var AVATAR_FALLBACK = "assets/img/avatar-placeholder.svg";

  /* ---------- util ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeUsername(raw) {
    return String(raw || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9._]/g, "")
      .slice(0, 30);
  }

  function getApiBaseUrl() {
    // Em desenvolvimento, use o servidor local para que a tela reflita
    // exatamente as APIs que estão no working tree.
    if (typeof location !== "undefined" && location && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || "")) {
      return location.origin;
    }

    var configured = String(CFG.API_BASE_URL || "").trim();
    if (configured) {
      return configured.replace(/\/$/, "");
    }

    if (typeof location !== "undefined" && location && location.protocol === "file:") {
      return "https://sitev3-main.vercel.app";
    }

    var origin = (typeof location !== "undefined" && location && location.origin) ? location.origin : "";
    return origin || "https://sitev3-main.vercel.app";
  }

  function apiUrl(path) {
    var cleanPath = String(path || "");
    if (!cleanPath) return getApiBaseUrl();
    if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
    return getApiBaseUrl() + (cleanPath.charAt(0) === "/" ? cleanPath : "/" + cleanPath);
  }

  function normalizePhotoUrl(rawUrl) {
    if (!rawUrl) return AVATAR_FALLBACK;
    var value = String(rawUrl).trim();
    if (!value) return AVATAR_FALLBACK;
    if (value.startsWith("data:")) return value;

    if (value.startsWith("/api/image?url=")) {
      return getApiBaseUrl() + value;
    }
    if (value.startsWith("/")) {
      return getApiBaseUrl() + value;
    }
    if (value.startsWith("//")) return "https:" + value;

    try {
      var url = new URL(value);
      if (url.origin === location.origin) return url.href;
      if (/cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(url.hostname)) {
        return getApiBaseUrl() + "/api/image?url=" + encodeURIComponent(url.href);
      }
      return url.href;
    } catch (e) {
      return value;
    }
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name) || "";
  }

  function clearStoredUsername() {
    try {
      sessionStorage.removeItem("stalkea_current_username");
      sessionStorage.removeItem("stalkea_last_username");
      sessionStorage.removeItem("stalkea_profile_cache");
      Object.keys(sessionStorage).forEach(function (key) {
        if (
          key.indexOf("stalkea_network_") === 0 ||
          key.indexOf("stalkea_network_v2_") === 0 ||
          key.indexOf("stalkea_dm_contacts_") === 0 ||
          key.indexOf("stalkea_cached_profile_") === 0
        ) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) {}
    try {
      localStorage.removeItem("espionado_username");
      localStorage.removeItem("stalkea_current_username");
      localStorage.removeItem("stalkea_last_username");
      localStorage.removeItem("stalkea_cached_profile");
      Object.keys(localStorage).forEach(function (key) {
        if (
          key.indexOf("stalkea_network_") === 0 ||
          key.indexOf("stalkea_network_v2_") === 0 ||
          key.indexOf("stalkea_dm_contacts_") === 0 ||
          key.indexOf("stalkea_cached_profile_") === 0
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {}
  }

  function clearUserCachesFor(cleanUsername) {
    var clean = sanitizeUsername(cleanUsername);
    if (!clean) return;
    var lower = clean.toLowerCase();

    function clearFrom(storage) {
      try {
        Object.keys(storage).forEach(function (key) {
          var candidates = ["stalkea_network_v2_", "stalkea_network_", "stalkea_dm_contacts_", "stalkea_cached_profile_"];
          for (var i = 0; i < candidates.length; i++) {
            var prefix = candidates[i];
            if (key.indexOf(prefix) !== 0) continue;
            var suffix = key.slice(prefix.length).toLowerCase();
            if (suffix === lower) {
              storage.removeItem(key);
              break;
            }
          }
        });
      } catch (e) {}
    }

    clearFrom(sessionStorage);
    clearFrom(localStorage);
  }

  function clearUsername() {
    clearStoredUsername();
    return "";
  }

  function getUsername() {
    var fromUrl = sanitizeUsername(
      getParam("u") ||
      getParam("username") ||
      getParam("user") ||
      getParam("perfil") ||
      getParam("profile") ||
      getParam("ig")
    );
    if (fromUrl) {
      setUsername(fromUrl);
      return fromUrl;
    }
    try {
      var fromSession = sanitizeUsername(sessionStorage.getItem("stalkea_current_username") || sessionStorage.getItem("stalkea_last_username") || "");
      if (fromSession) return fromSession;
    } catch (e) {}
    try {
      var fromLocal = sanitizeUsername(localStorage.getItem("stalkea_current_username") || localStorage.getItem("espionado_username") || "");
      if (fromLocal) return fromLocal;
    } catch (e) {}
    return "";
  }

  function setUsername(u) {
    var clean = sanitizeUsername(u);
    if (!clean) return "";

    var current = "";
    try {
      current = sanitizeUsername(sessionStorage.getItem("stalkea_current_username") || sessionStorage.getItem("stalkea_last_username") || "");
    } catch (e) {}
    if (!current) {
      try {
        current = sanitizeUsername(localStorage.getItem("stalkea_current_username") || localStorage.getItem("espionado_username") || "");
      } catch (e) {}
    }

    if (current && current !== clean) {
      clearUserCachesFor(current);
    }

    try {
      sessionStorage.setItem("stalkea_current_username", clean);
      sessionStorage.setItem("stalkea_last_username", clean);
      sessionStorage.removeItem("stalkea_profile_cache");
    } catch (e) {}

    try {
      localStorage.setItem("espionado_username", clean);
      localStorage.setItem("stalkea_current_username", clean);
      localStorage.setItem("stalkea_last_username", clean);
      localStorage.removeItem("stalkea_cached_profile");
    } catch (e) {}

    return clean;
  }

  function getCachedProfile(username, maxAgeMs) {
    var clean = sanitizeUsername(username || getUsername());
    if (!clean) return null;
    var cacheKey = "stalkea_cached_profile_" + clean.toLowerCase();
    var ttl = typeof maxAgeMs === "number" ? Math.max(0, maxAgeMs) : 30 * 60 * 1000;
    try {
      var raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || !parsed.data) return null;
      if ((Date.now() - parsed.ts) > ttl) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function withUsername(path, u) {
    var clean = sanitizeUsername(u || getUsername());
    return clean ? path + "?username=" + encodeURIComponent(clean) : path;
  }

  function withUsernameOnUrl(url, u) {
    var target = String(url || "revelacao.html");
    var clean = sanitizeUsername(u || getUsername());
    if (!clean) return target;

    try {
      var parsed = new URL(target, location.href);
      parsed.searchParams.set("username", clean);
      parsed.searchParams.set("u", clean);
      parsed.searchParams.set("user", clean);
      parsed.searchParams.set("perfil", clean);
      parsed.searchParams.set("profile", clean);
      parsed.searchParams.set("ig", clean);
      return parsed.toString();
    } catch (e) {
      var sep = target.indexOf("?") === -1 ? "?" : "&";
      return (
        target + sep +
        "username=" + encodeURIComponent(clean) +
        "&u=" + encodeURIComponent(clean) +
        "&user=" + encodeURIComponent(clean) +
        "&perfil=" + encodeURIComponent(clean) +
        "&profile=" + encodeURIComponent(clean) +
        "&ig=" + encodeURIComponent(clean)
      );
    }
  }

  function goFinal() {
    var url = CFG.FINAL_URL || "feed.html";
    var clean = sanitizeUsername(getUsername());
    if (clean) clearUserCachesFor(clean);
    var target = withUsernameOnUrl(url, clean);
    try {
      var parsed = new URL(target, location.href);
      var cacheBust = String(Date.now());
      parsed.searchParams.set("cb", cacheBust);
      parsed.searchParams.set("cacheBust", cacheBust);
      parsed.searchParams.set("noCache", "1");
      target = parsed.toString();
    } catch (e) {
      var cacheBustFallback = String(Date.now());
      target += (target.indexOf("?") === -1 ? "?" : "&") + "cb=" + cacheBustFallback + "&cacheBust=" + cacheBustFallback + "&noCache=1";
    }
    window.location.replace(target);
  }

  /* ---------- busca do perfil público via Cloudflare Worker ---------- */
  /* Retorna Promise<{status, username, displayName, photoUrl, followers,
     following, posts}>. status: "ok" | "notfound" | "unavailable" */
  function fallbackProfileData(username) {
    var clean = sanitizeUsername(username) || "perfil";
    var displayName = clean
      .split(/[._]/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ") || "Perfil";

    return {
      username: clean,
      displayName: displayName,
      photoUrl: avatarDataUri(clean, 0),
      followers: "1,2 mil",
      following: "426",
      posts: "83",
      isPrivate: false,
      isVerified: false,
    };
  }

  function fetchProfile(username, options) {
    var clean = sanitizeUsername(username);
    var progress = options && typeof options.onProgress === "function" ? options.onProgress : function () {};
    if (!clean) {
      return Promise.resolve({
        status: "notfound",
        username: "",
        displayName: "",
        photoUrl: AVATAR_FALLBACK,
        followers: "\u2014",
        following: "\u2014",
        posts: "\u2014",
      });
    }

    var base = fallbackProfileData(clean);
    base.status = "unavailable";

    var cacheKey = "stalkea_cached_profile_" + clean.toLowerCase();
    var timeoutMs = 55000;

    try {
      var rawCached = localStorage.getItem(cacheKey);
      if (rawCached) {
        var cached = JSON.parse(rawCached);
          if (cached && cached.ts && (Date.now() - cached.ts) < 5 * 60 * 1000 && cached.data) {
            var cachedPhoto = String((cached.data && cached.data.photoUrl) || "").trim();
            var isGeneratedAvatar = cachedPhoto.indexOf("data:image/svg+xml,") === 0;
            if (!isGeneratedAvatar && cached.data.status === "ok" && cached.data.source !== "degraded") {
              progress({ type: "sources", total: 1 });
              progress({ type: "attempt", index: 0, total: 1, url: "cache" });
              progress({ type: "result", index: 0, total: 1, payload: cached.data });
              return Promise.resolve(cached.data);
            }
        }
      }
    } catch (e) {}

    var sources = [apiUrl("/api/profile?username=" + encodeURIComponent(clean))];
    if (CFG.WORKER_URL) {
      var workerUrl = CFG.WORKER_URL.replace(/\/$/, "") + "?username=" + encodeURIComponent(clean);
      workerUrl = apiUrl(workerUrl);
      if (workerUrl !== sources[0]) sources.push(workerUrl);
    }

    // Em localhost, WORKER_URL normalmente aponta para a mesma rota local.
    // Nao repita a consulta nem prolongue o estado de carregamento.
    sources = sources.filter(function (url, index, list) {
      return list.indexOf(url) === index;
    });

    function requestSource(url, index, total) {
      progress({ type: "attempt", index: index, total: total, url: url });
      return Promise.race([
        fetch(url, { method: "GET", cache: "no-store" })
          .then(function (r) {
            if (r.status === 404) return { __notfound: true };
            if (!r.ok) return { __unavailable: true };
            return r.json();
          }),
        new Promise(function (resolve) {
          setTimeout(function () {
            resolve({ __timeout: true });
          }, timeoutMs);
        })
      ]).then(function (payload) {
        progress({ type: "result", index: index, total: total, payload: payload });
        return payload;
      }).catch(function () {
        progress({ type: "result", index: index, total: total, payload: { __unavailable: true } });
        return { __unavailable: true };
      });
    }

    function fallbackResultIfNeeded(payload) {
      if (payload && Array.isArray(payload.following) && payload.following.length) return payload.following;
      if (payload && Array.isArray(payload.followers) && payload.followers.length) return payload.followers;
      if (window.IG_DATA && Array.isArray(window.IG_DATA.following) && window.IG_DATA.following.length) {
        return window.IG_DATA.following.slice(0, 10);
      }
      return fallbackNetworkList(clean);
    }

    function toResult(data) {
      if (!data || data.__timeout || data.__unavailable) return null;
      if (data.source === "degraded") return null;
      if (data.__notfound || data.error === "profile not found") {
        return { status: "notfound", username: clean };
      }

      var resolvedUsername = sanitizeUsername(
        data.username ||
        (data.user && data.user.username) ||
        (data.data && data.data.user && data.data.user.username)
      ) || clean;

      if (resolvedUsername.toLowerCase() !== clean.toLowerCase()) return null;

      var resolvedPhoto = normalizePhotoUrl(data.photoUrl || data.profile_pic_url || "");
      if (!resolvedPhoto || resolvedPhoto === AVATAR_FALLBACK) {
        resolvedPhoto = avatarDataUri(data.displayName || data.full_name || clean || "Perfil", 0);
      } else if (/^https?:\/\//i.test(resolvedPhoto)) {
        try {
          var parsedPhoto = new URL(resolvedPhoto);
          var isSameOrigin = parsedPhoto.origin === location.origin;
          var trustedApiOrigin = "";
          try {
            trustedApiOrigin = new URL(getApiBaseUrl()).origin;
          } catch (_e) {}
          if (!isSameOrigin && /cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(parsedPhoto.hostname)) {
            resolvedPhoto = "/api/image?url=" + encodeURIComponent(parsedPhoto.href);
          } else if (!isSameOrigin && trustedApiOrigin && parsedPhoto.origin === trustedApiOrigin) {
            resolvedPhoto = parsedPhoto.href;
          } else if (!isSameOrigin) {
            resolvedPhoto = avatarDataUri(data.displayName || data.full_name || clean || "Perfil", 0);
          }
        } catch (e) {
          resolvedPhoto = avatarDataUri(data.displayName || data.full_name || clean || "Perfil", 0);
        }
      }

      var result = {
        status: "ok",
        username: resolvedUsername,
        displayName: data.displayName || data.full_name || resolvedUsername,
        photoUrl: resolvedPhoto,
        followers: formatNum(data.followers != null ? data.followers : data.follower_count),
        following: formatNum(data.following != null ? data.following : data.following_count),
        posts: formatNum(data.posts != null ? data.posts : data.media_count),
        isPrivate: !!(data.isPrivate || data.is_private),
        isVerified: !!(data.isVerified || data.is_verified),
        source: data.source || "verified-public",
      };

      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: result }));
      } catch (e) {}

      return result;
    }

    progress({ type: "sources", total: sources.length });
    return requestSource(sources[0], 0, sources.length).then(function (first) {
      var firstResult = toResult(first);
      if (firstResult) return firstResult;
      if (first && first.__notfound) return { status: "notfound", username: clean };
      if (first && first.__unavailable) return Object.assign({ status: "unavailable" }, base);
      if (sources.length < 2) return Object.assign({ status: "unavailable" }, base);

      return requestSource(sources[1], 1, sources.length).then(function (second) {
        var secondResult = toResult(second);
        if (secondResult) return secondResult;
        if (second && second.__notfound) return { status: "notfound", username: clean };
        return Object.assign({ status: "unavailable" }, base);
      });
    }).catch(function () {
      return Object.assign({ status: "unavailable" }, base);
    });
  }

  function fallbackNetworkList(username) {
    var base = [
      { username: "anaduartedsg", fullName: "Ana Duarte | Web", profilePicUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "infinityleads_", fullName: "Infinity Leads | Marketing", profilePicUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "corretoraabrsaude", fullName: "Corretora ABR Saúde", profilePicUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "tzviagens.taylone", fullName: "TZ Viagens Taylone", profilePicUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVerified: true, isPrivate: false },
      { username: "tntsportsbr", fullName: "TNT Sports Brasil", profilePicUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80", isVerified: true, isPrivate: false },
      { username: "fatosdesconhecidos", fullName: "Fatos Desconhecidos", profilePicUrl: "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=400&q=80", isVerified: true, isPrivate: false },
      { username: "drissshaida", fullName: "Shaida Driss", profilePicUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "jewagem.khazz", fullName: "JEWAGEM.KHAZZ", profilePicUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "beatriz.moura", fullName: "Beatriz Moura", profilePicUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "laura.santos", fullName: "Laura Santos", profilePicUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "marcos.oliveira", fullName: "Marcos Oliveira", profilePicUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
      { username: "gabriela.mendes", fullName: "Gabriela Mendes", profilePicUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false }
    ];

    var clean = sanitizeUsername(username) || "perfil";
    var list = base.slice();
    if (list.length && clean) {
      var seed = clean.toLowerCase();
      list = list.map(function (person, idx) {
        var suffix = seed + ":" + idx;
        var hash = 0;
        for (var i = 0; i < suffix.length; i++) {
          hash = (hash * 31 + suffix.charCodeAt(i)) >>> 0;
        }
        return { username: person.username, fullName: person.fullName, profilePicUrl: person.profilePicUrl, isVerified: person.isVerified, isPrivate: person.isPrivate, __order: (hash % list.length) };
      }).sort(function (a, b) { return a.__order - b.__order; }).map(function (person) {
        delete person.__order;
        return person;
      });
    }
    return list.slice(0, 8);
  }

  /* ---------- avatar gerado (contatos fictícios do Direct) ---------- */
  var AVATAR_GRADS = [
    ["#f09433", "#dc2743"], ["#405de6", "#5851db"], ["#833ab4", "#c13584"],
    ["#00c6ff", "#0072ff"], ["#11998e", "#38ef7d"], ["#f7971e", "#ffd200"],
    ["#ee0979", "#ff6a00"], ["#654ea3", "#eaafc8"],
  ];
  function avatarDataUri(name, index) {
    var initials = String(name || "?")
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join("") || "?";
    var g = AVATAR_GRADS[(index || 0) % AVATAR_GRADS.length];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop stop-color="' + g[0] + '"/><stop offset="1" stop-color="' + g[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="100" height="100" rx="50" fill="url(#g)"/>' +
      '<text x="50" y="50" dy=".35em" text-anchor="middle" fill="#fff" ' +
      'font-family="Inter,Arial,sans-serif" font-size="40" font-weight="700">' + initials + '</text></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  /* ---------- relógio da "avaliação gratuita" (7 min) ---------- */
  var TRIAL_KEY = "stalkea_trial_start_v2";
  var TRIAL_MS = 7 * 60 * 1000;
  function trialRemainingMs() {
    var start;
    try { start = parseInt(sessionStorage.getItem(TRIAL_KEY), 10); } catch (e) { start = 0; }
    if (!start) {
      start = Date.now();
      try { sessionStorage.setItem(TRIAL_KEY, String(start)); } catch (e) {}
    }
    return Math.max(0, TRIAL_MS - (Date.now() - start));
  }
  function formatClock(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function formatNum(v) {
    if (v == null || v === "") return "\u2014";
    if (typeof v === "string" && /[a-z%]/i.test(v)) return v; // já formatado (ex.: "1,2 mi")
    var n = Number(v);
    if (isNaN(n)) return String(v);
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " mi";
    if (n >= 1e3) return n.toLocaleString("pt-BR");
    return String(n);
  }

  /* ---------- back-redirect trap (passo 6) ---------- */
  /* Ao apertar "voltar", em vez de sair, cai em back-redirect.html. */
  function armBackRedirect() {
    if (/back-redirect\.html$/.test(location.pathname)) return;
    if (/revelacao\.html$/.test(location.pathname)) return;
    try {
      history.pushState({ stalkeaTrap: true }, "", location.href);
    } catch (e) { return; }
    window.addEventListener("popstate", function () {
      window.location.href = withUsername("back-redirect.html", getUsername());
    });
  }

  window.StalkeaFunnel = {
    escapeHtml: escapeHtml,
    sanitizeUsername: sanitizeUsername,
    normalizePhotoUrl: normalizePhotoUrl,
    apiUrl: apiUrl,
    clearUsername: clearUsername,
    getParam: getParam,
    clearStoredUsername: clearStoredUsername,
    getUsername: getUsername,
    setUsername: setUsername,
    getCachedProfile: getCachedProfile,
    withUsername: withUsername,
    withUsernameOnUrl: withUsernameOnUrl,
    goFinal: goFinal,
    fetchProfile: fetchProfile,
    fallbackProfileData: fallbackProfileData,
    fallbackNetworkList: fallbackNetworkList,
    formatNum: formatNum,
    avatarDataUri: avatarDataUri,
    trialRemainingMs: trialRemainingMs,
    formatClock: formatClock,
    armBackRedirect: armBackRedirect,
    AVATAR_FALLBACK: AVATAR_FALLBACK,
  };
})();
