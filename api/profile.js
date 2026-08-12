/*
=============================================================================
API /api/profile
=============================================================================

Busca perfil público do Instagram através da Apify.

GET:
  /api/profile?username=lumenwebco

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

Variável necessária na Vercel:

APIFY_API_TOKEN

=============================================================================
*/


// ============================================================================
// CACHE EM MEMÓRIA
// ============================================================================
//
// Mantém perfis consultados recentemente em memória.
//
// IMPORTANTE:
// Em Serverless, esse cache não é permanente.
// Porém, enquanto a mesma instância estiver ativa,
// consultas repetidas podem ser muito mais rápidas.
// ============================================================================

const profileCache = new Map();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos


// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

module.exports = async function handler(req, res) {

  // --------------------------------------------------------------------------
  // CORS
  // --------------------------------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  // --------------------------------------------------------------------------
  // OPTIONS
  // --------------------------------------------------------------------------

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }


  // --------------------------------------------------------------------------
  // SOMENTE GET
  // --------------------------------------------------------------------------

  if (req.method !== "GET") {
    res.status(405).json({
      error: "method not allowed"
    });

    return;
  }


  // --------------------------------------------------------------------------
  // USERNAME
  // --------------------------------------------------------------------------

  const rawUsername =
    (req.query && req.query.username) || "";


  const username = String(rawUsername)
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 30);


  // --------------------------------------------------------------------------
  // USERNAME INVÁLIDO
  // --------------------------------------------------------------------------

  if (!username) {

    res.status(400).json({
      error: "missing username"
    });

    return;
  }


  // --------------------------------------------------------------------------
  // CHAVE DO CACHE
  // --------------------------------------------------------------------------

  const cacheKey = username.toLowerCase();


  // --------------------------------------------------------------------------
  // VERIFICA CACHE
  // --------------------------------------------------------------------------

  const cached = profileCache.get(cacheKey);


  if (cached) {

    const age = Date.now() - cached.timestamp;


    if (age < CACHE_TTL) {

      res.setHeader(
        "Cache-Control",
        "public, max-age=300, s-maxage=300"
      );


      res.setHeader(
        "X-Profile-Cache",
        "HIT"
      );


      res.status(200).json(cached.data);

      return;
    }


    // Cache expirado

    profileCache.delete(cacheKey);
  }


  // --------------------------------------------------------------------------
  // BUSCA PERFIL
  // --------------------------------------------------------------------------

  try {

    let rawJson;


    // ========================================================================
    // APIFY
    // ========================================================================

    if (process.env.APIFY_API_TOKEN) {

      rawJson = await fetchViaApify(username);

    } else {

      // ======================================================================
      // FALLBACK INSTAGRAM
      // ======================================================================

      rawJson = await fetchViaInstagram(username);
    }


    // ------------------------------------------------------------------------
    // ERRO DO PROVIDER
    // ------------------------------------------------------------------------

    if (rawJson && rawJson.__status) {

      res.status(rawJson.__status).json({
        error: rawJson.__error || "upstream"
      });

      return;
    }


    // ------------------------------------------------------------------------
    // NORMALIZA
    // ------------------------------------------------------------------------

    const payload =
      normalizeProfile(rawJson, username);


    // ------------------------------------------------------------------------
    // VERIFICA SE REALMENTE EXISTE
    // ------------------------------------------------------------------------
    //
    // Um perfil pode ter:
    // - username
    // - nome
    // - foto
    //
    // mesmo que alguns contadores sejam null.
    //
    // Portanto NÃO usamos followers como condição obrigatória.
    // ------------------------------------------------------------------------

    if (!payload.username) {

      res.status(404).json({
        error: "profile not found"
      });

      return;
    }


    // ------------------------------------------------------------------------
    // SALVA NO CACHE
    // ------------------------------------------------------------------------

    profileCache.set(cacheKey, {
      timestamp: Date.now(),
      data: payload
    });


    // ------------------------------------------------------------------------
    // LIMITA TAMANHO DO CACHE
    // ------------------------------------------------------------------------

    if (profileCache.size > 100) {

      const firstKey =
        profileCache.keys().next().value;

      if (firstKey) {
        profileCache.delete(firstKey);
      }
    }


    // ------------------------------------------------------------------------
    // CACHE HTTP
    // ------------------------------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=600"
    );


    res.setHeader(
      "X-Profile-Cache",
      "MISS"
    );


    // ------------------------------------------------------------------------
    // RETORNA PERFIL
    // ------------------------------------------------------------------------

    res.status(200).json(payload);


  } catch (error) {

    console.error(
      "PROFILE ERROR:",
      error
    );


    res.status(502).json({

      error: "fetch failed",

      details:
        error?.message ||
        "unknown error"

    });

  }

};


// ============================================================================
// APIFY
// ============================================================================

async function fetchViaApify(username) {

  const token =
    process.env.APIFY_API_TOKEN;


  // --------------------------------------------------------------------------
  // TOKEN
  // --------------------------------------------------------------------------

  if (!token) {

    return {

      __status: 500,

      __error:
        "APIFY_API_TOKEN não configurado"

    };
  }


  // --------------------------------------------------------------------------
  // INPUT
  // --------------------------------------------------------------------------

  const input = {

    usernames: [
      username
    ],

    resultsLimit: 1

  };


  // --------------------------------------------------------------------------
  // ACTOR
  // --------------------------------------------------------------------------

  const runUrl =
    "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?waitForFinish=120";


  // --------------------------------------------------------------------------
  // INICIA ACTOR
  // --------------------------------------------------------------------------

  const runResponse =
    await fetchWithTimeout(

      runUrl,

      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`

        },

        body:
          JSON.stringify(input)

      },

      125000

    );


  // --------------------------------------------------------------------------
  // ERRO AO INICIAR
  // --------------------------------------------------------------------------

  if (!runResponse.ok) {

    const text =
      await runResponse.text();


    console.error(
      "APIFY RUN ERROR:",
      text
    );


    return {

      __status:
        runResponse.status,

      __error:
        "Apify: " + text

    };
  }


  // --------------------------------------------------------------------------
  // RESULTADO DO RUN
  // --------------------------------------------------------------------------

  const run =
    await runResponse.json();


  // --------------------------------------------------------------------------
  // DATASET
  // --------------------------------------------------------------------------

  const datasetId =
    run?.data?.defaultDatasetId;


  if (!datasetId) {

    return {

      __status: 502,

      __error:
        "Apify não retornou dataset"

    };
  }


  // --------------------------------------------------------------------------
  // BUSCA DATASET
  // --------------------------------------------------------------------------

  const datasetUrl =
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`;


  const datasetResponse =
    await fetchWithTimeout(

      datasetUrl,

      {

        method: "GET",

        headers: {

          Authorization:
            `Bearer ${token}`

        }

      },

      30000

    );


  // --------------------------------------------------------------------------
  // ERRO DATASET
  // --------------------------------------------------------------------------

  if (!datasetResponse.ok) {

    const text =
      await datasetResponse.text();


    console.error(
      "APIFY DATASET ERROR:",
      text
    );


    return {

      __status:
        datasetResponse.status,

      __error:
        "Apify dataset: " + text

    };
  }


  // --------------------------------------------------------------------------
  // ITEMS
  // --------------------------------------------------------------------------

  const items =
    await datasetResponse.json();


  // --------------------------------------------------------------------------
  // PERFIL NÃO ENCONTRADO
  // --------------------------------------------------------------------------

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {

    return {

      __status: 404,

      __error:
        "Perfil não encontrado"

    };
  }


  // --------------------------------------------------------------------------
  // IMPORTANTE
  // --------------------------------------------------------------------------
  //
  // A Apify pode retornar mais informações.
  // Pegamos o primeiro resultado.
  // --------------------------------------------------------------------------

  return items[0];

}


// ============================================================================
// FALLBACK INSTAGRAM
// ============================================================================

async function fetchViaInstagram(username) {

  const IG_APP_ID =
    "936619743392459";


  const apiUrl =
    "https://i.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(username);


  const response =
    await fetchWithTimeout(

      apiUrl,

      {

        headers: {

          "x-ig-app-id":
            IG_APP_ID,

          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0 Safari/537.36",

          Accept:
            "application/json",

          "Accept-Language":
            "pt-BR,pt;q=0.9,en;q=0.8"

        }

      },

      15000

    );


  if (!response.ok) {

    return {

      __status:
        response.status === 404
          ? 404
          : 502,

      __error:
        "ig " + response.status

    };
  }


  return response.json();

}


// ============================================================================
// NORMALIZA PERFIL
// ============================================================================

function normalizeProfile(
  json,
  fallbackUser
) {

  const u =
    findProfileObject(json);


  if (!u) {

    return {

      username:
        fallbackUser,

      displayName:
        fallbackUser,

      photoUrl:
        "",

      followers:
        null,

      following:
        null,

      posts:
        null,

      isPrivate:
        false,

      isVerified:
        false

    };
  }


  // --------------------------------------------------------------------------
  // USERNAME
  // --------------------------------------------------------------------------

  const username =
    firstString([

      u.username,

      u.userName,

      u.user_name,

      u.handle

    ]) ||
    fallbackUser;


  // --------------------------------------------------------------------------
  // NOME
  // --------------------------------------------------------------------------

  const displayName =
    firstString([

      u.fullName,

      u.full_name,

      u.displayName,

      u.display_name,

      u.name,

      u.username

    ]) ||
    fallbackUser;


  // --------------------------------------------------------------------------
  // FOTO
  // --------------------------------------------------------------------------

  const photoUrl =
    cleanUrl(

      firstString([

        u.profilePicUrlHD,

        u.profilePicUrl,

        u.profile_pic_url_hd,

        u.profile_pic_url,

        u.profilePicture,

        u.profile_picture,

        u.avatar

      ])

    );


  // --------------------------------------------------------------------------
  // SEGUIDORES
  // --------------------------------------------------------------------------

  const followers =
    toNum(

      firstValue([

        u.followersCount,

        u.followerCount,

        u.follower_count,

        u.followers,

        u.edge_followed_by?.count

      ])

    );


  // --------------------------------------------------------------------------
  // SEGUINDO
  // --------------------------------------------------------------------------

  const following =
    toNum(

      firstValue([

        u.followsCount,

        u.followingCount,

        u.following_count,

        u.following,

        u.edge_follow?.count

      ])

    );


  // --------------------------------------------------------------------------
  // POSTS
  // --------------------------------------------------------------------------

  const posts =
    toNum(

      firstValue([

        u.postsCount,

        u.mediaCount,

        u.media_count,

        u.posts,

        u.edge_owner_to_timeline_media?.count

      ])

    );


  // --------------------------------------------------------------------------
  // PRIVADO
  // --------------------------------------------------------------------------

  const isPrivate =
    Boolean(

      firstValue([

        u.private,

        u.isPrivate,

        u.is_private

      ])

    );


  // --------------------------------------------------------------------------
  // VERIFICADO
  // --------------------------------------------------------------------------

  const isVerified =
    Boolean(

      firstValue([

        u.verified,

        u.isVerified,

        u.is_verified

      ])

    );


  // --------------------------------------------------------------------------
  // RESULTADO FINAL
  // --------------------------------------------------------------------------

  return {

    username,

    displayName,

    photoUrl,

    followers,

    following,

    posts,

    isPrivate,

    isVerified

  };

}


// ============================================================================
// ENCONTRA OBJETO DO PERFIL
// ============================================================================
//
// Suporta tanto o retorno direto da Apify quanto alguns formatos aninhados.
// ============================================================================

function findProfileObject(json) {

  if (
    !json ||
    typeof json !== "object"
  ) {
    return null;
  }


  // --------------------------------------------------------------------------
  // Formato direto da Apify
  // --------------------------------------------------------------------------

  if (
    looksLikeProfile(json)
  ) {

    return json;

  }


  // --------------------------------------------------------------------------
  // Formatos aninhados
  // --------------------------------------------------------------------------

  const candidates = [

    json.data,

    json.data?.user,

    json.data?.data?.user,

    json.user,

    json.profile,

    json.result,

    json.response

  ];


  for (
    const candidate
    of candidates
  ) {

    if (
      candidate &&
      typeof candidate === "object" &&
      looksLikeProfile(candidate)
    ) {

      return candidate;

    }

  }


  return null;

}


// ============================================================================
// DETECTA PERFIL
// ============================================================================

function looksLikeProfile(obj) {

  if (
    !obj ||
    typeof obj !== "object"
  ) {

    return false;

  }


  return Boolean(

    obj.username ||

    obj.fullName ||

    obj.full_name ||

    obj.profilePicUrl ||

    obj.profilePicUrlHD ||

    obj.followersCount ||

    obj.follower_count

  );

}


// ============================================================================
// PEGA PRIMEIRO STRING VÁLIDO
// ============================================================================

function firstString(values) {

  for (
    const value
    of values
  ) {

    if (
      typeof value === "string" &&
      value.trim()
    ) {

      return value.trim();

    }

  }


  return "";

}


// ============================================================================
// PEGA PRIMEIRO VALOR EXISTENTE
// ============================================================================

function firstValue(values) {

  for (
    const value
    of values
  ) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {

      return value;

    }

  }


  return null;

}


// ============================================================================
// LIMPA URL
// ============================================================================

function cleanUrl(value) {

  if (
    !value ||
    typeof value !== "string"
  ) {

    return "";

  }


  let url =
    value.trim();


  // --------------------------------------------------------------------------
  // Se vier como Markdown:
  //
  // [https://site.com/foto.jpg](https://site.com/foto.jpg)
  // --------------------------------------------------------------------------

  const markdownMatch =
    url.match(
      /^\[.*?\]\((https?:\/\/.+)\)$/
    );


  if (markdownMatch) {

    url =
      markdownMatch[1];

  }


  // --------------------------------------------------------------------------
  // Remove aspas
  // --------------------------------------------------------------------------

  url =
    url.replace(
      /^["']|["']$/g,
      ""
    );


  // --------------------------------------------------------------------------
  // Verifica URL
  // --------------------------------------------------------------------------

  if (
    !/^https?:\/\//i.test(url)
  ) {

    return "";

  }


  return url;

}


// ============================================================================
// CONVERTE NÚMEROS
// ============================================================================

function toNum(value) {

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {

    return null;

  }


  if (
    typeof value === "number"
  ) {

    return Number.isFinite(value)
      ? value
      : null;

  }


  const text =
    String(value)
      .replace(/[^\d.]/g, "");


  if (!text) {

    return null;

  }


  const number =
    Number(text);


  return Number.isNaN(number)
    ? null
    : number;

}


// ============================================================================
// FETCH COM TIMEOUT
// ============================================================================
//
// Impede que a função fique esperando indefinidamente.
// ============================================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 30000
) {

  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );


  try {

    return await fetch(

      url,

      {
        ...options,
        signal:
          controller.signal
      }

    );

  } catch (error) {

    if (
      error?.name === "AbortError"
    ) {

      throw new Error(
        "Tempo limite excedido ao consultar o serviço"
      );

    }


    throw error;

  } finally {

    clearTimeout(timer);

  }

}