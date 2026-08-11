/*
  Vercel Serverless Function
  GET /api/profile?username=algum_perfil
*/

const IG_APP_ID = "936619743392459";

module.exports = async function handler(req, res) {
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
    let rawJson;

    if (process.env.RAPIDAPI_KEY) {
      rawJson = await fetchViaProvider(username);
    } else {
      rawJson = await fetchViaInstagram(username);
    }

    if (rawJson && rawJson.__status) {
      res.status(rawJson.__status).json({
        error: rawJson.__error || "upstream",
      });
      return;
    }

    const payload = normalizeProfile(rawJson, username);

    if (
      !payload.username &&
      !payload.photoUrl &&
      payload.followers == null
    ) {
      res.status(404).json({
        error: "profile not found",
      });
      return;
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=300"
    );

    res.status(200).json(payload);
  } catch (err) {
    console.error("PROFILE ERROR:", err);

    res.status(502).json({
      error: "fetch failed",
    });
  }
};


/*
  RapidAPI
  Instagram Scraper Stable API
  POST /ig_get_fb_profile_v3.php
*/
async function fetchViaProvider(username) {
  const host =
    process.env.RAPIDAPI_HOST ||
    "instagram-scraper-stable-api.p.rapidapi.com";

  const url =
    "https://" +
    host +
    "/ig_get_fb_profile_v3.php";

  const r = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": host,
    },

    body: new URLSearchParams({
      username_or_url: username,
    }),
  });

  if (!r.ok) {
    console.error("RapidAPI status:", r.status);

    return {
      __status: r.status === 404 ? 404 : 502,
      __error: "provider " + r.status,
    };
  }

  return r.json();
}


/*
  Fallback direto do Instagram
*/
async function fetchViaInstagram(username) {
  const apiUrl =
    "https://i.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(username);

  const r = await fetch(apiUrl, {
    headers: {
      "x-ig-app-id": IG_APP_ID,

      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0 Safari/537.36",

      Accept: "application/json",

      "Accept-Language":
        "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  if (!r.ok) {
    return {
      __status: r.status === 404 ? 404 : 502,
      __error: "ig " + r.status,
    };
  }

  return r.json();
}


/*
  Converte a resposta da RapidAPI
  para o formato que seu frontend espera.
*/
function normalizeProfile(json, fallbackUser) {
  const u = locateUser(json) || {};

  return {
    username:
      u.username ||
      fallbackUser,

    displayName:
      u.full_name ||
      u.username ||
      fallbackUser,

    photoUrl:
      u.hd_profile_pic_url_info?.url ||
      u.profile_pic_url ||
      "",

    followers:
      toNum(u.follower_count),

    following:
      toNum(u.following_count),

    posts:
      toNum(u.media_count),

    isPrivate:
      Boolean(u.is_private),

    isVerified:
      Boolean(u.is_verified),
  };
}


/*
  Localiza o objeto do usuário
  dentro da resposta da API.
*/
function locateUser(json) {
  if (!json || typeof json !== "object") {
    return null;
  }

  const candidates = [
    "data.user",
    "data.data.user",
    "graphql.user",
    "user",
    "data",
    "result",
    "response",
    "profile",
    "data.data",
  ];

  for (const path of candidates) {
    const value = getPath(json, path);

    if (
      value &&
      typeof value === "object" &&
      looksLikeUser(value)
    ) {
      return value;
    }
  }

  if (looksLikeUser(json)) {
    return json;
  }

  return null;
}


/*
  Verifica se o objeto parece ser um perfil.
*/
function looksLikeUser(obj) {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  return (
    "username" in obj ||
    "full_name" in obj ||
    "profile_pic_url" in obj ||
    "follower_count" in obj ||
    "following_count" in obj ||
    "media_count" in obj
  );
}


/*
  Acessa propriedades como:
  "data.user.username"
*/
function getPath(obj, path) {
  return path
    .split(".")
    .reduce(
      (acc, key) => (acc == null ? acc : acc[key]),
      obj
    );
}


/*
  Converte valores para número.
*/
function toNum(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const number = Number(
    String(value).replace(/[^\d.]/g, "")
  );

  return Number.isNaN(number) ? null : number;
}