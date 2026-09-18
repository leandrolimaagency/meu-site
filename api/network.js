const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
const REMOTE_NETWORK_URL = "https://stalkeia.website/api/proxy/instagram.php";
const APIFY_FOLLOWING_ACTOR_ID = process.env.APIFY_FOLLOWING_ACTOR_ID || "wtur12Qqi5ixjuDdb";
const INSTAGRAM_APP_ID = "936619743392459";
const INSTAGRAM_PAGE_LIMIT = 3;
const IMPORT_CACHE_TTL = 30 * 60 * 1000;

const networkCache = new Map();
const CACHE_TTL = 20 * 1000;

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

async function fetchWithTimeout(resource, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseInstagramCookies(raw) {
  const value = String(raw || "").trim();
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cookies) ? parsed.cookies : []);
    return list.reduce((cookies, item) => {
      if (item && item.name && item.value) cookies[item.name] = String(item.value);
      return cookies;
    }, {});
  } catch (_) {
    return value.split(";").reduce((cookies, pair) => {
      const separator = pair.indexOf("=");
      if (separator > 0) cookies[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
      return cookies;
    }, {});
  }
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => name + "=" + value).join("; ");
}

function normalizeInstagramFollowingUser(item) {
  if (!item || typeof item !== "object") return null;
  return normalizeNetworkUser({
    username: item.username,
    full_name: item.full_name,
    profile_pic_url: item.profile_pic_url || item.profile_pic_url_hd,
    is_private: item.is_private,
    is_verified: item.is_verified,
  });
}

async function fetchInstagramRelationship(username, userId, relation, headers) {
  const users = [];
  let maxId = "";

  for (let page = 0; page < INSTAGRAM_PAGE_LIMIT; page += 1) {
    const url = new URL("https://www.instagram.com/api/v1/friendships/" + userId + "/" + relation + "/");
    url.searchParams.set("count", "100");
    if (maxId) url.searchParams.set("max_id", maxId);

    const response = await fetchWithTimeout(url, { headers }, 12000);
    if (!response.ok) throw new Error("Instagram " + relation + " " + response.status);
    const payload = await response.json();
    const pageUsers = Array.isArray(payload?.users) ? payload.users : [];
    users.push(...pageUsers);
    maxId = String(payload?.next_max_id || "");
    if (!maxId || pageUsers.length === 0) break;
  }

  return users.map(normalizeInstagramFollowingUser).filter(Boolean);
}

async function fetchFollowingViaInstagram(username) {
  const cookies = parseInstagramCookies(process.env.INSTAGRAM_COOKIES || process.env.APIFY_INSTAGRAM_COOKIES);
  if (!cookies.sessionid && !cookies.ds_user_id) return null;

  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "X-IG-App-ID": INSTAGRAM_APP_ID,
    Referer: "https://www.instagram.com/" + username + "/",
    Cookie: cookieHeader(cookies),
  };
  if (cookies.csrftoken) headers["X-CSRFToken"] = cookies.csrftoken;

  const profileUrl = new URL("https://www.instagram.com/api/v1/users/web_profile_info/");
  profileUrl.searchParams.set("username", username);
  const profileResponse = await fetchWithTimeout(profileUrl, { headers }, 12000);
  if (!profileResponse.ok) throw new Error("Instagram profile " + profileResponse.status);
  const profilePayload = await profileResponse.json();
  const user = profilePayload?.data?.user;
  const userId = String(user?.id || "");
  if (!userId) throw new Error("Instagram profile id missing");

  const [following, followers] = await Promise.all([
    fetchInstagramRelationship(username, userId, "following", headers),
    fetchInstagramRelationship(username, userId, "followers", headers),
  ]);
  if (!following.length && !followers.length) throw new Error("Instagram returned no relationships");

  return {
    username,
    fullName: String(user.full_name || ""),
    photoUrl: toSafeImage(user.profile_pic_url || user.profile_pic_url_hd),
    following,
    followers,
    publicPosts: [],
    source: "instagram-cookie-following",
    updatedAt: Date.now(),
  };
}

function toSafeImage(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const nested = parsed.searchParams.get("url");
    const candidate = nested || raw;
    const host = new URL(candidate).hostname;

    if (ALLOWED_HOSTS.test(host)) {
      return "/api/image?url=" + encodeURIComponent(candidate);
    }
  } catch (_) {
    return "";
  }

  return "";
}

function firstNonEmpty(values) {
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function extractPostMediaUrl(item) {
  if (!item || typeof item !== "object") return "";

  const edges = item?.edge_owner_to_timeline_media?.edges;
  const firstNode = Array.isArray(edges) && edges[0] && edges[0].node ? edges[0].node : null;

  const direct = firstNonEmpty([
    item.latest_post_image,
    item.latestPostImage,
    item.last_post_image,
    item.lastPostImage,
    item.post_media_url,
    item.postMediaUrl,
    item.media_url,
    item.mediaUrl,
    item.thumbnail_url,
    item.thumbnailUrl,
    item.display_url,
    item.displayUrl,
    firstNode?.display_url,
    firstNode?.thumbnail_src,
    firstNode?.display_src,
  ]);

  return toSafeImage(direct);
}

function normalizeNetworkUser(item) {
  const username = sanitizeUsername(item && item.username);
  if (!username) return null;

  const fullName =
    String((item && (item.full_name || item.fullName || item.name)) || username).trim() || username;

  const rawPhoto = item && (item.profile_pic_url || item.profilePicUrl || item.profile_pic_url_hd);
  const postMediaUrl = extractPostMediaUrl(item);

  return {
    username,
    fullName,
    photoUrl: toSafeImage(rawPhoto),
    postMediaUrl,
    isPrivate: !!(item && (item.is_private || item.private)),
    isVerified: !!(item && (item.is_verified || item.verified)),
  };
}

function pickArray(json, keys) {
  for (const key of keys) {
    if (Array.isArray(json?.[key])) {
      return json[key];
    }
  }
  return [];
}

function normalizePayload(json, username) {
  const followingRaw = pickArray(json, [
    "lista_seguindo",
    "following",
    "seguindo",
  ]);

  const profile =
    json?.perfil_completo && typeof json.perfil_completo === "object"
      ? json.perfil_completo
      : {};
  const profileFullName = String(profile.full_name || "").trim();
  const profilePhotoUrl = toSafeImage(profile.profile_pic_url || "");

  const postsRaw = pickArray(json, ["lista_posts", "posts"]);
  const publicPosts = postsRaw
    .map((post) => {
      const mediaUrl = toSafeImage(
        post && (post.image_url || post.imageUrl || post.thumbnail_url || post.thumbnailUrl)
      );
      return mediaUrl
        ? { id: String(post.id || post.shortcode || mediaUrl), mediaUrl, isVideo: !!post.is_video }
        : null;
    })
    .filter(Boolean)
    .slice(0, 12);

  const followersRaw = pickArray(json, [
    "lista_seguidores",
    "followers",
    "seguidores",
  ]);

  const following = followingRaw.map(normalizeNetworkUser).filter(Boolean);
  const followers = followersRaw.map(normalizeNetworkUser).filter(Boolean);

  const profileMeta = { fullName: profileFullName, photoUrl: profilePhotoUrl };

  if (following.length || followers.length) {
    return { following, followers, source: "proxy", profile: profileMeta, publicPosts };
  }

  return {
    following: [],
    followers: [],
    source: "degraded",
    profile: profileMeta,
    publicPosts,
  };
}

async function fetchProxyPayload(username, tipo, timeoutMs) {
  const remote = new URL(REMOTE_NETWORK_URL);
  remote.searchParams.set("tipo", tipo);
  remote.searchParams.set("username", username);

  const upstream = await fetchWithTimeout(
    remote.toString(),
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
    },
    timeoutMs
  );

  if (!upstream.ok) {
    throw new Error("upstream " + upstream.status + " tipo=" + tipo);
  }

  return upstream.json();
}

async function fetchFollowingViaApify(username) {
  const token = String(process.env.APIFY_API_TOKEN || "").trim();
  if (!token) return null;
  const response = await fetchWithTimeout(
    "https://api.apify.com/v2/acts/" + APIFY_FOLLOWING_ACTOR_ID + "/runs?waitForFinish=45",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify((() => {
        const input = {
          username,
          mode: "following",
          maxResults: 100,
          enrichProfiles: false,
          monitorEnabled: false,
          maxTotalChargeUsd: 0.50,
        };
        if (process.env.APIFY_INSTAGRAM_COOKIES) {
          input.cookies = process.env.APIFY_INSTAGRAM_COOKIES;
        }
        return input;
      })()),
    },
    50000,
  );
  if (!response.ok) throw new Error("Apify run " + response.status);
  const run = await response.json();
  const datasetId = run?.data?.defaultDatasetId;
  if (!datasetId) throw new Error("Apify dataset missing");
  const datasetResponse = await fetchWithTimeout(
    "https://api.apify.com/v2/datasets/" + datasetId + "/items?clean=true",
    { headers: { Authorization: "Bearer " + token, Accept: "application/json" } },
    30000,
  );
  if (!datasetResponse.ok) throw new Error("Apify dataset " + datasetResponse.status);
  const items = await datasetResponse.json();
  return {
    username,
    fullName: "",
    photoUrl: "",
    following: collectFollowingRows(items).map(normalizeNetworkUser).filter(Boolean),
    followers: [],
    publicPosts: [],
    source: "apify-following",
    updatedAt: Date.now(),
  };
}

function collectFollowingRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectFollowingRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (value.username || value.userName || value.handle) rows.push(value);
  for (const key of ["data", "result", "users", "following", "items", "results", "edges"]) {
    if (value[key]) collectFollowingRows(value[key], rows);
  }
  return rows;
}

async function fetchFollowingViaRapidApi(username) {
  const key = String(process.env.RAPIDAPI_KEY || "").trim();
  const host = String(process.env.RAPIDAPI_HOST || "").trim();
  if (!key || !host) return null;

  const query = encodeURIComponent(username);
  const paths = [
    "/v1/following?username_or_id_or_url=" + query,
    "/v1/following?username=" + query,
    "/v1/user/following?username=" + query,
  ];
  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(
        "https://" + host + path,
        { headers: { "x-rapidapi-key": key, "x-rapidapi-host": host, Accept: "application/json" } },
        12000,
      );
      if (!response.ok) continue;
      const data = await response.json();
      const following = collectFollowingRows(data).map(normalizeNetworkUser).filter(Boolean);
      if (following.length) {
        return { username, following, followers: [], publicPosts: [], source: "rapidapi-following", updatedAt: Date.now() };
      }
    } catch (_) {}
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const username = sanitizeUsername(body.username || "");
    const rawFollowing = Array.isArray(body.following)
      ? body.following
      : (Array.isArray(body.users) ? body.users : []);
    const following = rawFollowing
      .slice(0, 5000)
      .map(normalizeNetworkUser)
      .filter(Boolean);

    if (!username || !following.length) {
      sendJson(res, 400, { error: "username and following are required" });
      return;
    }

    const result = {
      username,
      fullName: String(body.fullName || "").trim(),
      photoUrl: toSafeImage(body.photoUrl || ""),
      following,
      followers: [],
      publicPosts: [],
      source: "browser-import",
      updatedAt: Date.now(),
    };

    networkCache.set(username.toLowerCase(), { timestamp: Date.now(), data: result });
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 200, result);
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
  const cached = networkCache.get(cacheKey);
  const cacheTtl = cached?.data?.source === "browser-import" ? IMPORT_CACHE_TTL : CACHE_TTL;
  if (cached && cached.data && cached.data.following?.length && Date.now() - cached.timestamp < cacheTtl) {
    res.setHeader("Cache-Control", "public, max-age=20, s-maxage=20, stale-while-revalidate=600");
    res.setHeader("X-Network-Cache", "HIT");
    sendJson(res, 200, cached.data);
    return;
  }

  try {
    let lastError = null;
    let normalized = null;

    // O Actor dedicado e a fonte oficial da lista de seguidos.
    if (process.env.APIFY_API_TOKEN) {
      try {
        normalized = await fetchFollowingViaApify(username);
      } catch (error) {
        lastError = error;
      }
    }

    if (!normalized || !normalized.following.length) {
      try {
        const allPayload = await fetchProxyPayload(username, "all", 12000);
        normalized = normalizePayload(allPayload, username);
      } catch (error) {
        lastError = lastError || error;
      }
    }

    try {
      if (!normalized || !normalized.following.length) {
        normalized = await fetchFollowingViaInstagram(username);
      }
    } catch (error) {
      lastError = lastError || error;
    }

    if (!normalized || !normalized.following.length) {
      try {
        normalized = await fetchFollowingViaRapidApi(username);
      } catch (error) {
        lastError = error;
      }
    }

    // Se nao veio nada util (nem gente, nem posts, nem perfil), tenta
    //    busca_completa como segunda chance.
    var hasUseful = normalized && (
      normalized.following.length ||
      normalized.followers.length ||
      (normalized.publicPosts || []).length ||
      (normalized.profile && normalized.profile.fullName)
    );

    if (!hasUseful || (normalized && normalized.following.length < 7)) {
      try {
        const litePayload = await fetchProxyPayload(username, "busca_completa", 12000);
        const liteNorm = normalizePayload(litePayload, username);
        var liteUseful = liteNorm && (
          liteNorm.following.length ||
          liteNorm.followers.length ||
          (liteNorm.publicPosts || []).length ||
          (liteNorm.profile && liteNorm.profile.fullName)
        );
        if (liteUseful) {
          if (!normalized || !normalized.following.length) {
            normalized = liteNorm;
          } else {
            const seen = new Set(normalized.following.map((person) => person.username.toLowerCase()));
            for (const person of liteNorm.following) {
              const key = person.username.toLowerCase();
              if (seen.has(key)) continue;
              normalized.following.push(person);
              seen.add(key);
            }
            if (!normalized.publicPosts.length) normalized.publicPosts = liteNorm.publicPosts;
            if (!normalized.profile.fullName) normalized.profile = liteNorm.profile;
          }
        }
      } catch (error) {
        lastError = lastError || error;
      }
    }

    const result = {
      username,
      fullName: (normalized && normalized.profile && normalized.profile.fullName) || "",
      photoUrl: (normalized && normalized.profile && normalized.profile.photoUrl) || "",
      following: (normalized && normalized.following) || [],
      followers: (normalized && normalized.followers) || [],
      publicPosts: (normalized && normalized.publicPosts) || [],
      source: (normalized && normalized.source) || "unavailable",
      updatedAt: Date.now(),
    };

    if (result.following.length) {
      networkCache.set(cacheKey, { timestamp: Date.now(), data: result });
    }

    if (networkCache.size > 100) {
      const firstKey = networkCache.keys().next().value;
      if (firstKey) networkCache.delete(firstKey);
    }

    res.setHeader("Cache-Control", "public, max-age=20, s-maxage=20, stale-while-revalidate=600");
    res.setHeader("X-Network-Cache", (lastError && result.source === "degraded") ? "DEGRADED" : "MISS");

    if (result.source === "degraded" || result.source === "unavailable") {
      sendJson(res, 503, {
        ...result,
        source: "unavailable",
        error: "following unavailable",
        reason: lastError?.message || "no provider returned following",
      });
      return;
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error("NETWORK ERROR:", error);
    sendJson(res, 502, {
      error: "fetch failed",
      details: error?.message || "unknown error",
    });
  }
};
