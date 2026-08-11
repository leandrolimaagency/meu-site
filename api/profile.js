/* =============================================================================
   Função serverless (Vercel) — busca do perfil PÚBLICO do Instagram (passo 3).
   Recebe: GET /api/profile?username=algum_perfil
   Retorna: JSON { username, displayName, photoUrl, followers, following, posts,
                   isPrivate, isVerified }.

   Estratégia:
   1) Se houver uma API de terceiros configurada (env RAPIDAPI_KEY + RAPIDAPI_HOST),
      usa ela — é o caminho confiável, porque o IG bloqueia servidores de nuvem.
   2) Senão, tenta o endpoint público do IG direto (quase sempre bloqueado por 429
      quando vem de datacenter — serve só como último recurso).

   Só usa informação PÚBLICA (foto, nome, contadores). Nenhum login, nada privado.
   ============================================================================= */

const IG_APP_ID = "936619743392459"; // app id público do web client do IG

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const raw = (req.query && req.query.username) || "";
  const username = String(raw)
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 30);

  if (!username) {
    res.status(400).json({ error: "missing username" });
    return;
  }

  try {
    const rawJson = process.env.RAPIDAPI_KEY
      ? await fetchViaProvider(username)
      : await fetchViaInstagram(username);

    if (rawJson && rawJson.__status) {
  res
    .status(rawJson.__status)
    .json({ error: rawJson.__error || "upstream" });
  return;
}

    const payload = normalizeProfile(rawJson, username);
    if (!payload.username && !payload.photoUrl && payload.followers == null) {
      res.status(404).json({ error: "profile not found" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({ error: "fetch failed" });
  }
}

/* --------- API de terceiros (RapidAPI) --------- */

async function fetchViaProvider(username) {
  const host =
    process.env.RAPIDAPI_HOST ||
    "instagram-scraper-stable-api.p.rapidapi.com";

  const path =
    process.env.RAPIDAPI_PROFILE_PATH ||
    "/get_ig_user_about.php";

  const param =
    process.env.RAPIDAPI_PROFILE_PARAM ||
    "username_or_url";

  const cleanUsername = String(username)
    .trim()
    .replace(/^@+/, "");

  const url =
    `https://${host}${path}?${param}=${encodeURIComponent(cleanUsername)}`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": host,
    },
  });

  const text = await r.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!r.ok) {
    return {
      __status: r.status === 404 ? 404 : 502,
      __error: "provider " + r.status,
      details: data,
    };
  }

  return data;
}

/* --------- Endpoint público do IG direto (fallback, costuma dar 429) ----- */
async function fetchViaInstagram(username) {
  const apiUrl =
    "https://i.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(username);
  const r = await fetch(apiUrl, {
    headers: {
      "x-ig-app-id": IG_APP_ID,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "application/json",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });
  if (!r.ok) return { __status: r.status === 404 ? 404 : 502, __error: "ig " + r.status };
  return r.json();
}

/* --------- Normalizador tolerante a diferentes formatos de API ----------- */
function normalizeProfile(json, fallbackUser) {
  const u = locateUser(json) || {};
  const pick = (obj, keys) => {
    for (const k of keys) {
      const v = getPath(obj, k);
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };

  const photoUrl = pick(u, [
    "profile_pic_url_hd", "profile_pic_url", "profilePicUrl", "profile_picture",
    "hd_profile_pic_url_info.url", "profile_pic_url_hd_proxy", "avatar", "avatar_url",
    "profile_image", "image",
  ]);
  const followers = pick(u, [
    "edge_followed_by.count", "follower_count", "followers", "followersCount",
    "followed_by_count", "follower",
  ]);
  const following = pick(u, [
    "edge_follow.count", "following_count", "following", "followingCount",
    "follows_count",
  ]);
  const posts = pick(u, [
    "edge_owner_to_timeline_media.count", "media_count", "posts", "postsCount",
    "post_count",
  ]);

  return {
    username: pick(u, ["username", "user_name", "handle"]) || fallbackUser,
    displayName: pick(u, ["full_name", "fullName", "name", "display_name"]) ||
      pick(u, ["username"]) || fallbackUser,
    photoUrl: photoUrl || "",
    followers: toNum(followers),
    following: toNum(following),
    posts: toNum(posts),
    isPrivate: !!pick(u, ["is_private", "isPrivate", "private"]),
    isVerified: !!pick(u, ["is_verified", "isVerified", "verified"]),
  };
}

// Encontra o objeto do usuário em respostas aninhadas comuns.
function locateUser(json) {
  if (!json || typeof json !== "object") return null;
  const candidates = [
    "data.user", "data.data.user", "graphql.user", "user", "data", "result",
    "response", "profile", "data.data",
  ];
  for (const c of candidates) {
    const v = getPath(json, c);
    if (v && typeof v === "object" && looksLikeUser(v)) return v;
  }
  return looksLikeUser(json) ? json : (getPath(json, "data") || json);
}

function looksLikeUser(o) {
  if (!o || typeof o !== "object") return false;
  return (
    "username" in o || "full_name" in o || "profile_pic_url" in o ||
    "edge_followed_by" in o || "follower_count" in o || "followers" in o
  );
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}
