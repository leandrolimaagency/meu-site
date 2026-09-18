const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

const mediaCache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;
const STALE_TTL = 48 * 60 * 60 * 1000;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj).replace(/[\u0080-\uffff]/g, (c) => {
    return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
  });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).send(body);
}

function sanitizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 30);
}

async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function igHeaders() {
  return {
    "x-ig-app-id": "936619743392459",
    "x-asbd-id": "129477",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    Origin: "https://www.instagram.com",
    Referer: "https://www.instagram.com/",
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

async function fetchUserProfileInfo(username) {
  const endpoints = [
    "https://i.instagram.com/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username),
    "https://www.instagram.com/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username),
  ];

  let lastStatus = 0;
  for (const endpoint of endpoints) {
    const upstream = await fetchWithTimeout(endpoint, {
      headers: igHeaders(),
      cache: "no-store",
    }, 9000);

    lastStatus = upstream.status;
    if (upstream.ok) {
      const json = await upstream.json();
      return { ok: true, status: upstream.status, json };
    }

    if (upstream.status === 404) {
      return { ok: false, status: 404 };
    }

    if (upstream.status === 429) {
      continue;
    }

    continue;
  }

  return { ok: false, status: lastStatus || 502 };
}

function toSafeImage(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    if (ALLOWED_HOSTS.test(host)) {
      return "/api/image?url=" + encodeURIComponent(parsed.toString());
    }
  } catch (_) {
    return "";
  }

  return "";
}

function pickNodeImage(node) {
  if (!node || typeof node !== "object") return "";

  return (
    toSafeImage(node.display_url) ||
    toSafeImage(node.thumbnail_src) ||
    toSafeImage(node.display_src) ||
    toSafeImage(node.image_versions2?.candidates?.[0]?.url)
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  const username = sanitizeUsername(req.query?.username || "");
  if (!username) {
    sendJson(res, 400, { error: "missing username" });
    return;
  }

  const cacheKey = username.toLowerCase();
  const cached = mediaCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
    sendJson(res, 200, cached.data);
    return;
  }

  try {
    const upstream = await fetchUserProfileInfo(username);

    if (!upstream.ok) {
      if (cached && Date.now() - cached.ts < STALE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120, stale-while-revalidate=86400");
        sendJson(res, 200, { ...cached.data, stale: true });
        return;
      }
      sendJson(res, upstream.status || 502, { error: "upstream failed" });
      return;
    }

    const json = upstream.json;
    const user = json && json.data && json.data.user ? json.data.user : null;

    const edges = Array.isArray(user?.edge_owner_to_timeline_media?.edges)
      ? user.edge_owner_to_timeline_media.edges
      : [];

    const media = edges
      .map((edge) => pickNodeImage(edge && edge.node))
      .filter(Boolean)
      .slice(0, 6);

    const payload = {
      username,
      isPrivate: !!user?.is_private,
      count: media.length,
      media,
      updatedAt: Date.now(),
    };

    mediaCache.set(cacheKey, { ts: Date.now(), data: payload });
    if (mediaCache.size > 300) {
      const firstKey = mediaCache.keys().next().value;
      if (firstKey) mediaCache.delete(firstKey);
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
    sendJson(res, 200, payload);
  } catch (error) {
    if (cached && Date.now() - cached.ts < STALE_TTL) {
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120, stale-while-revalidate=86400");
      sendJson(res, 200, { ...cached.data, stale: true });
      return;
    }

    sendJson(res, 200, {
      username,
      isPrivate: false,
      count: 0,
      media: [],
      updatedAt: Date.now(),
      degraded: true,
    });
  }
};
