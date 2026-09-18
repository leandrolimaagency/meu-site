/* =============================================================================
   Proxy de imagem — serve a foto de perfil PÚBLICA pelo próprio domínio,
   evitando o bloqueio de hotlink do CDN do Instagram no navegador.

   GET /api/image?url=<url da foto no CDN do IG>

   Segurança: só aceita URLs dos domínios do Instagram/Facebook CDN
   (não é um proxy aberto — evita SSRF/abuso).
   ============================================================================= */

const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

module.exports = async function handler(req, res) {
  const raw = (req.query && req.query.url) || "";

  let target;
  try {
    target = new URL(String(raw));
  } catch (e) {
    res.status(400).json({ error: "invalid url" });
    return;
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.test(target.hostname)) {
    res.status(403).json({ error: "host not allowed" });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // sem Referer, como o navegador com referrerpolicy=no-referrer
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "upstream " + upstream.status });
      return;
    }

    const contentType =
      upstream.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buf);
  } catch (err) {
    res.status(502).json({ error: "fetch failed" });
  }
}
