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

  function getParam(name) {
    return new URLSearchParams(location.search).get(name) || "";
  }

  function getUsername() {
    var fromUrl = sanitizeUsername(getParam("username"));
    if (fromUrl) return fromUrl;
    try { return sanitizeUsername(localStorage.getItem("espionado_username")); } catch (e) { return ""; }
  }

  function setUsername(u) {
    var clean = sanitizeUsername(u);
    try { localStorage.setItem("espionado_username", clean); } catch (e) {}
    return clean;
  }

  function withUsername(path, u) {
    var clean = sanitizeUsername(u || getUsername());
    return clean ? path + "?username=" + encodeURIComponent(clean) : path;
  }

  function goFinal() {
    var url = CFG.FINAL_URL || "revelacao.html";
    window.location.href = url;
  }

  /* ---------- busca do perfil público via Cloudflare Worker ---------- */
  /* Retorna Promise<{status, username, displayName, photoUrl, followers,
     following, posts}>. status: "ok" | "notfound" | "unavailable" */
  function fetchProfile(username) {
    var clean = sanitizeUsername(username);
    var base = {
      username: clean,
      displayName: clean,
      photoUrl: AVATAR_FALLBACK,
      followers: "1.284",
      following: "532",
      posts: "97",
    };

    // Sem Worker configurado: não há como pesquisar de verdade -> modo prévia.
    if (!CFG.WORKER_URL) {
      return Promise.resolve(Object.assign({ status: "unavailable" }, base));
    }

    var url = CFG.WORKER_URL.replace(/\/$/, "") + "?username=" + encodeURIComponent(clean);
    return fetch(url, { method: "GET" })
      .then(function (r) {
        if (r.status === 404) return { __notfound: true };
        if (!r.ok) return { __unavailable: true };
        return r.json();
      })
      .then(function (data) {
        if (data && data.__notfound) return { status: "notfound", username: clean };
        if (!data || data.__unavailable) return Object.assign({ status: "unavailable" }, base);
        if (!data.username && !data.photoUrl) return { status: "notfound", username: clean };
        return {
          status: "ok",
          username: sanitizeUsername(data.username) || clean,
          displayName: data.displayName || data.full_name || clean,
          photoUrl: data.photoUrl || data.profile_pic_url || AVATAR_FALLBACK,
          followers: formatNum(data.followers != null ? data.followers : data.follower_count),
          following: formatNum(data.following != null ? data.following : data.following_count),
          posts: formatNum(data.posts != null ? data.posts : data.media_count),
          isPrivate: !!data.isPrivate,
          isVerified: !!data.isVerified,
        };
      })
      .catch(function () { return Object.assign({ status: "unavailable" }, base); });
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

  /* ---------- relógio da "avaliação gratuita" (10 min) ---------- */
  var TRIAL_KEY = "stalkea_trial_start";
  var TRIAL_MS = 10 * 60 * 1000;
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
    if (v == null || v === "") return "—";
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
    getParam: getParam,
    getUsername: getUsername,
    setUsername: setUsername,
    withUsername: withUsername,
    goFinal: goFinal,
    fetchProfile: fetchProfile,
    formatNum: formatNum,
    avatarDataUri: avatarDataUri,
    trialRemainingMs: trialRemainingMs,
    formatClock: formatClock,
    armBackRedirect: armBackRedirect,
    AVATAR_FALLBACK: AVATAR_FALLBACK,
  };
})();
