/*
=============================================================================
Função serverless (Vercel) — busca perfil PÚBLICO do Instagram

Recebe:
GET /api/profile?username=algum_perfil

Retorna:
{
  username,
  displayName,
  photoUrl,
  followers,
  following,
  posts,
  isPrivate,
  isVerified
}

Agora utiliza:
Apify — Instagram Profile Scraper

A chave NÃO fica neste arquivo.
Ela deve estar na Vercel como:

APIFY_API_TOKEN
=============================================================================
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
    res.status(400).json({
      error: "missing username",
    });
    return;
  }

  try {
    let rawJson;

    /*
    =========================================================================
    APIFY
    =========================================================================
    */

    if (process.env.APIFY_API_TOKEN) {
      rawJson = await fetchViaApify(username);
    } else {
      /*
      =========================================================================
      FALLBACK — Instagram direto
      =========================================================================
      */

      rawJson = await fetchViaInstagram(username);
    }

    /*
    =========================================================================
    TRATAMENTO DE ERROS
    =========================================================================
    */

    if (rawJson && rawJson.__status) {
      res.status(rawJson.__status).json({
        error: rawJson.__error || "upstream",
      });
      return;
    }

    /*
    =========================================================================
    NORMALIZA OS DADOS DA APIFY
    =========================================================================
    */

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
      details: err?.message || "unknown error",
    });
  }
};


/*
=============================================================================
APIFY — Instagram Profile Scraper
=============================================================================
*/

async function fetchViaApify(username) {
  const token = process.env.APIFY_API_TOKEN;

  if (!token) {
    return {
      __status: 500,
      __error: "APIFY_API_TOKEN não configurado",
    };
  }

  /*
  Input enviado para o Actor da Apify.
  */

  const input = {
    usernames: [username],
    resultsLimit: 1,
  };

  /*
  Inicia o Actor e aguarda a execução terminar.
  */

  const runUrl =
    "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?waitForFinish=120";

  const runResponse = await fetch(runUrl, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },

    body: JSON.stringify(input),
  });

  if (!runResponse.ok) {
    const text = await runResponse.text();

    console.error("APIFY RUN ERROR:", text);

    return {
      __status: runResponse.status,
      __error: "Apify: " + text,
    };
  }

  const run = await runResponse.json();

  /*
  ID do Dataset gerado pelo Actor.
  */

  const datasetId = run?.data?.defaultDatasetId;

  if (!datasetId) {
    return {
      __status: 502,
      __error: "Apify não retornou dataset",
    };
  }

  /*
  Busca os resultados do Dataset.
  */

  const datasetUrl =
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`;

  const datasetResponse = await fetch(datasetUrl, {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!datasetResponse.ok) {
    const text = await datasetResponse.text();

    console.error("APIFY DATASET ERROR:", text);

    return {
      __status: datasetResponse.status,
      __error: "Apify dataset: " + text,
    };
  }

  const items = await datasetResponse.json();

  /*
  Verifica se o Actor encontrou algum perfil.
  */

  if (!Array.isArray(items) || items.length === 0) {
    return {
      __status: 404,
      __error: "Perfil não encontrado",
    };
  }

  /*
  Retorna o primeiro perfil encontrado.
  */

  return items[0];
}


/*
=============================================================================
FALLBACK — Instagram direto
=============================================================================
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
=============================================================================
NORMALIZA OS DADOS DA APIFY
=============================================================================

A Apify retorna campos como:

username
fullName
followersCount
followsCount
profilePicUrlHD
profilePicUrl
private
verified
postsCount

Transformamos para o formato que seu site já utiliza.
=============================================================================
*/

function normalizeProfile(json, fallbackUser) {
  const u = json || {};

  return {
    username:
      u.username ||
      fallbackUser,

    displayName:
      u.fullName ||
      u.username ||
      fallbackUser,

    photoUrl:
      u.profilePicUrlHD ||
      u.profilePicUrl ||
      "",

    followers:
      toNum(u.followersCount),

    following:
      toNum(u.followsCount),

    posts:
      toNum(
        u.postsCount ??
        u.mediaCount ??
        u.posts
      ),

    isPrivate:
      Boolean(u.private),

    isVerified:
      Boolean(u.verified),
  };
}


/*
=============================================================================
CONVERSÃO DE NÚMEROS
=============================================================================
*/

function toNum(v) {
  if (v == null || v === "") {
    return null;
  }

  if (typeof v === "number") {
    return v;
  }

  const n = Number(
    String(v).replace(/[^\d.]/g, "")
  );

  return Number.isNaN(n) ? null : n;
}