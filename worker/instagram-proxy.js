/* =============================================================================
   Cloudflare Worker — proxy do perfil PÚBLICO do Instagram (passo 3).
   Recebe: GET ?username=algum_perfil
   Retorna: JSON { username, displayName, photoUrl, followers, following, posts,
                   isPrivate, isVerified } com cabeçalhos CORS.
   Só usa informação já pública. Não faz login, não acessa nada privado
   (isso é impossível). Se o IG bloquear/rate-limit, devolve 502 e o front
   cai no card de fallback.
   ============================================================================= */

const IG_APP_ID = "936619743392459"; // app id público usado pelo web client do IG

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const raw = url.searchParams.get("username") || "";
    const username = raw.trim().replace(/^@+/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30);

    if (!username) {
      return json({ error: "missing username" }, 400);
    }

    try {
      const apiUrl =
        "https://i.instagram.com/api/v1/users/web_profile_info/?username=" +
        encodeURIComponent(username);

      const res = await fetch(apiUrl, {
        headers: {
          "x-ig-app-id": IG_APP_ID,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      if (!res.ok) return json({ error: "ig status " + res.status }, 502);

      const data = await res.json();
      const u = data && data.data && data.data.user;
      if (!u) return json({ error: "profile not found" }, 404);

      const payload = {
        username: u.username || username,
        displayName: u.full_name || u.username || username,
        photoUrl: u.profile_pic_url_hd || u.profile_pic_url || "",
        followers: u.edge_followed_by ? u.edge_followed_by.count : null,
        following: u.edge_follow ? u.edge_follow.count : null,
        posts: u.edge_owner_to_timeline_media
          ? u.edge_owner_to_timeline_media.count
          : null,
        isPrivate: !!u.is_private,
        isVerified: !!u.is_verified,
      };

      return json(payload, 200, 300);
    } catch (err) {
      return json({ error: "fetch failed" }, 502);
    }
  },
};

function json(obj, status = 200, cacheSeconds = 0) {
  const headers = { "Content-Type": "application/json; charset=utf-8", ...CORS };
  if (cacheSeconds > 0) headers["Cache-Control"] = "public, max-age=" + cacheSeconds;
  return new Response(JSON.stringify(obj), { status, headers });
}
