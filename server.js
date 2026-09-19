const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const PORT = Number(process.env.PORT || 8099);
const REMOTE_PROFILE_URL = 'https://stalkea-funil-educativo.vercel.app/api/profile';
const REMOTE_NETWORK_URL = 'https://stalkeia.website/api/proxy/instagram.php';
const APIFY_FOLLOWING_ACTOR_ID = 'zmvXTNnmCOjErk4wh';
const APIFY_FOLLOWING_ENABLED = true;
const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

// Simple in-memory cache for profile lookups to speed up mobile loads
const profileCache = new Map();
const networkCache = new Map();
const mediaCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// fetch with timeout helper
async function fetchWithTimeout(resource, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchFollowingViaApify(username) {
  const token = String(process.env.APIFY_API_TOKEN || '').trim();
  if (!token) return null;

  const runUrl = 'https://api.apify.com/v2/acts/' + APIFY_FOLLOWING_ACTOR_ID + '/runs?waitForFinish=45';
  const input = {
    usernames: [username],
    dataToScrape: 'following',
    resultsLimit: 15,
  };
  const runResponse = await fetchWithTimeout(runUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 50000);
  if (!runResponse.ok) {
    const details = await runResponse.text();
    throw new Error('Apify run ' + runResponse.status + ': ' + details.slice(0, 500));
  }

  const run = await runResponse.json();
  const datasetId = run?.data?.defaultDatasetId;
  const keyValueStoreId = run?.data?.defaultKeyValueStoreId;
  if (!datasetId) throw new Error('Apify dataset missing');

  const datasetResponse = await fetchWithTimeout(
    'https://api.apify.com/v2/datasets/' + datasetId + '/items?clean=true',
    { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } },
    30000
  );
  if (!datasetResponse.ok) throw new Error('Apify dataset ' + datasetResponse.status);
  const items = await datasetResponse.json();
  let output = items;
  if ((!Array.isArray(items) || items.length === 0) && keyValueStoreId) {
    const outputResponse = await fetchWithTimeout(
      'https://api.apify.com/v2/key-value-stores/' + keyValueStoreId + '/records/OUTPUT?disableRedirect=true',
      { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } },
      30000
    );
    if (outputResponse.ok) output = await outputResponse.json();
  }
  const followingRows = Array.isArray(output) ? output : [];
  if (!followingRows.length) throw new Error('Apify sem contas; itens=' + (Array.isArray(items) ? items.length : typeof items));
  const following = followingRows.map(normalizeNetworkUser).filter(Boolean);
  return {
    username,
    fullName: '',
    photoUrl: '',
    following,
    followers: [],
    publicPosts: [],
    source: 'apify-following',
    updatedAt: Date.now(),
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function safeFilePath(base, requestPath) {
  const resolved = path.resolve(base, '.' + requestPath);
  if (resolved.startsWith(base)) return resolved;
  return null;
}

async function proxyImage(imageUrl) {
  let target;
  try {
    target = new URL(String(imageUrl));
  } catch (error) {
    throw new Error('invalid url');
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.test(target.hostname)) {
    throw new Error('host not allowed');
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
  });

  if (!upstream.ok) {
    throw new Error('upstream ' + upstream.status);
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { contentType, buffer };
}

async function proxyProfile(username) {
  const remoteUrl = new URL(REMOTE_PROFILE_URL);
  remoteUrl.searchParams.set('username', username || '');
  const upstream = await fetch(remoteUrl.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  const text = await upstream.text();
  return { status: upstream.status, body: text };
}

function sanitizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}

function fallbackProfilePayload(username) {
  const clean = sanitizeUsername(username) || 'perfil';
  const label = clean
    .split(/[._]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Perfil';

  return {
    username: clean,
    displayName: label,
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    followers: 1250,
    following: 426,
    posts: 83,
    isPrivate: false,
    isVerified: false,
  };
}

function fallbackNetworkPayload(username) {
  const clean = sanitizeUsername(username) || 'perfil';
  const base = [
    { username: 'anaduartedsg', fullName: 'Ana Duarte | Web', profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'infinityleads_', fullName: 'Infinity Leads | Marketing', profilePicUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'corretoraabrsaude', fullName: 'Corretora ABR Saúde', profilePicUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'tzviagens.taylone', fullName: 'TZ Viagens Taylone', profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80', isVerified: true, isPrivate: false },
    { username: 'tntsportsbr', fullName: 'TNT Sports Brasil', profilePicUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80', isVerified: true, isPrivate: false },
    { username: 'fatosdesconhecidos', fullName: 'Fatos Desconhecidos', profilePicUrl: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=400&q=80', isVerified: true, isPrivate: false },
    { username: 'drissshaida', fullName: 'Shaida Driss', profilePicUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'jewagem.khazz', fullName: 'JEWAGEM.KHAZZ', profilePicUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'beatriz.moura', fullName: 'Beatriz Moura', profilePicUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'laura.santos', fullName: 'Laura Santos', profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'marcos.oliveira', fullName: 'Marcos Oliveira', profilePicUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
    { username: 'gabriela.mendes', fullName: 'Gabriela Mendes', profilePicUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80', isVerified: false, isPrivate: false },
  ];

  const seed = clean.toLowerCase();
  const normalized = base
    .map((person, idx) => {
      let hash = 0;
      for (let i = 0; i < (seed + ':' + idx).length; i += 1) {
        hash = (hash * 31 + (seed + ':' + idx).charCodeAt(i)) >>> 0;
      }
      return { ...person, __order: hash % base.length };
    })
    .sort((a, b) => a.__order - b.__order)
    .slice(0, 8)
    .map(({ __order, ...person }) => person);

  return {
    username: clean,
    following: normalized,
    followers: normalized,
    source: 'fallback',
    updatedAt: Date.now(),
  };
}

function normalizeProfilePayload(raw, requestedUsername) {
  const u = raw?.data?.user || raw?.user || raw?.perfil_completo || raw;
  const normalizedUsername = sanitizeUsername(u && (u.username || u.userName));

  if (!normalizedUsername) return null;
  if (normalizedUsername.toLowerCase() !== requestedUsername.toLowerCase()) return null;

  const hasEvidence = Boolean(
    (u && (u.full_name || u.fullName || u.displayName)) ||
    (u && (u.profile_pic_url_hd || u.profile_pic_url || u.profilePicUrlHD || u.profilePicUrl)) ||
    (u && (u.edge_followed_by?.count != null || u.followersCount != null || u.follower_count != null)) ||
    (u && (u.edge_follow?.count != null || u.followingCount != null || u.following_count != null)) ||
    (u && (u.edge_owner_to_timeline_media?.count != null || u.mediaCount != null || u.media_count != null)) ||
    (u && (u.is_private === true || u.private === true || u.is_verified === true || u.verified === true))
  );

  if (!hasEvidence) return null;

  return {
    username: normalizedUsername,
    displayName: (u && (u.full_name || u.fullName || u.displayName)) || normalizedUsername,
    photoUrl: (u && (u.profile_pic_url_hd || u.profile_pic_url || u.profilePicUrlHD || u.profilePicUrl)) || '',
    followers: (u && (u.edge_followed_by?.count || u.followersCount || u.follower_count)) || null,
    following: (u && (u.edge_follow?.count || u.followingCount || u.following_count)) || null,
    posts: (u && (u.edge_owner_to_timeline_media?.count || u.mediaCount || u.media_count)) || null,
    isPrivate: !!(u && (u.is_private || u.private)),
    isVerified: !!(u && (u.is_verified || u.verified))
  };
}

async function fetchProfileViaNetworkProxy(username) {
  const target = new URL(REMOTE_NETWORK_URL);
  target.searchParams.set('tipo', 'perfil');
  target.searchParams.set('username', username);
  const response = await fetchWithTimeout(target.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'application/json',
    },
  }, 8000);
  if (!response.ok) throw new Error('profile upstream ' + response.status);
  return response.json();
}

function readMetaContent(html, property) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const propertyMatch = tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i);
    if (!propertyMatch || propertyMatch[1].toLowerCase() !== property.toLowerCase()) continue;
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (!contentMatch) continue;
    return String(contentMatch[1])
      .replace(/&amp;/g, '&')
      .replace(/&#x2F;/gi, '/')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCharCode(parseInt(value, 16)))
      .replace(/&#([0-9]+);/g, (_, value) => String.fromCharCode(Number(value)));
  }
  return '';
}

async function fetchProfileViaPublicPage(username) {
  const response = await fetchWithTimeout(
    'https://www.instagram.com/' + encodeURIComponent(username) + '/',
    { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } },
    12000
  );
  if (!response.ok) throw new Error('instagram page ' + response.status);

  const html = await response.text();
  const title = readMetaContent(html, 'og:title');
  const description = readMetaContent(html, 'og:description');
  const photoUrl = readMetaContent(html, 'og:image');
  const titleMatch = title.match(/^(.+?)\s*\(@([^)]*)\)/);
  const counts = description.match(/([\d.,]+)\s+Followers,\s+([\d.,]+)\s+Following,\s+([\d.,]+)\s+Posts/i);
  if (!titleMatch || !photoUrl) throw new Error('profile metadata unavailable');

  const toCount = (value) => Number(String(value || '').replace(/,/g, '').replace(/\./g, '')) || null;
  return {
    username: sanitizeUsername(titleMatch[2]) || username,
    displayName: titleMatch[1].trim(),
    photoUrl,
    followers: counts ? toCount(counts[1]) : null,
    following: counts ? toCount(counts[2]) : null,
    posts: counts ? toCount(counts[3]) : null,
    isPrivate: false,
    isVerified: false,
    source: 'public-page',
  };
}

function normalizeNetworkImage(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const candidate = parsed.searchParams.get('url') || raw;
    if (ALLOWED_HOSTS.test(new URL(candidate).hostname)) {
      return '/api/image?url=' + encodeURIComponent(candidate);
    }
  } catch (e) {}

  return '';
}

function normalizeNetworkUser(item) {
  const username = sanitizeUsername(item && (item.username || item.userName || item.handle || item.profile_username));
  if (!username) return null;

  const fullName = String((item && (item.full_name || item.fullName || item.name || item.display_name)) || username).trim();
  const rawPhotoUrl = String((item && (item.profile_pic_url || item.profilePicUrl || item.profile_pic_url_hd)) || '').trim();
  const isPrivate = !!(item && (item.is_private || item.private));
  const isVerified = !!(item && (item.is_verified || item.verified));

  const photoUrl = normalizeNetworkImage(rawPhotoUrl);

  return { username, fullName, photoUrl, isPrivate, isVerified };
}

async function fetchNetworkData(username) {
  const u = new URL(REMOTE_NETWORK_URL);
  u.searchParams.set('tipo', 'all');
  u.searchParams.set('username', username);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'application/json'
  };

  const res = await fetchWithTimeout(u.toString(), { headers }, 8000);
  if (!res.ok) throw new Error('network upstream ' + res.status);

  const json = await res.json();
  const followingRaw = Array.isArray(json.lista_seguindo) ? json.lista_seguindo : [];
  const followersRaw = Array.isArray(json.lista_seguidores) ? json.lista_seguidores : [];
  const suggestedRaw = Array.isArray(json.perfis_sugeridos)
    ? json.perfis_sugeridos
    : (Array.isArray(json.chaining_results) ? json.chaining_results : []);
  const postsRaw = Array.isArray(json.lista_posts) ? json.lista_posts : [];
  const perfil = json.perfil_completo && typeof json.perfil_completo === 'object' ? json.perfil_completo : {};
  const profileFullName = String(perfil.full_name || '').trim();
  const profilePhotoUrl = normalizeNetworkImage(perfil.profile_pic_url || '');
  const following = followingRaw.map(normalizeNetworkUser).filter(Boolean);
  const followers = followersRaw.map(normalizeNetworkUser).filter(Boolean);
  const suggested = suggestedRaw.map(normalizeNetworkUser).filter(Boolean);
  const publicPosts = postsRaw.map((post) => {
    const mediaUrl = normalizeNetworkImage(post && (post.image_url || post.imageUrl || post.thumbnail_url || post.thumbnailUrl));
    return mediaUrl ? { id: String(post.id || post.shortcode || mediaUrl), mediaUrl, isVideo: !!post.is_video } : null;
  }).filter(Boolean).slice(0, 12);

  return {
    username,
    fullName: profileFullName || username,
    photoUrl: profilePhotoUrl,
    following,
    followers,
    suggested,
    publicPosts,
    source: following.length || followers.length ? 'proxy' : (suggested.length ? 'profile-suggestions' : 'profile-posts'),
    updatedAt: Date.now(),
  };
}

async function serveStatic(req, res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream';

    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/image') {
    try {
      const imageUrl = url.searchParams.get('url');
      if (!imageUrl) {
        sendJson(res, 400, { error: 'missing url' });
        return;
      }

      const { contentType, buffer } = await proxyImage(decodeURIComponent(imageUrl));
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(buffer);
      return;
    } catch (error) {
      sendJson(res, 502, { error: String(error.message || 'fetch failed') });
      return;
    }
  }

  if (url.pathname === '/api/user-media') {
    try {
      const username = sanitizeUsername(url.searchParams.get('username') || '');
      if (!username) { sendJson(res, 400, { error: 'missing username' }); return; }

      const cacheKey = username.toLowerCase();
      const cached = mediaCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < (6 * 60 * 60 * 1000)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(cached.data));
        return;
      }

      const IG_APP_ID = '936619743392459';
      const igHeaders = {
        'x-ig-app-id': IG_APP_ID,
        'x-asbd-id': '129477',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      };

      // 1) Proxy stalkeia.website (funciona sem login e retorna lista_posts).
      let media = [];
      let mediaItems = [];
      let isPrivate = false;
      try {
        const proxyUrl = new URL(REMOTE_NETWORK_URL);
        proxyUrl.searchParams.set('tipo', 'all');
        proxyUrl.searchParams.set('username', username);
        const pres = await fetchWithTimeout(proxyUrl.toString(), { headers: { 'User-Agent': igHeaders['User-Agent'], 'Accept': 'application/json' } }, 10000);
        if (pres.ok) {
          const pj = await pres.json();
          const postsRaw = Array.isArray(pj.lista_posts) ? pj.lista_posts : (Array.isArray(pj.posts) ? pj.posts : []);
          mediaItems = postsRaw.map((p) => {
            const url = normalizeNetworkImage(p && (p.image_url || p.imageUrl || p.thumbnail_url));
            return url ? { url, isVideo: !!(p && (p.is_video || p.isVideo || p.media_type === 'VIDEO')) } : null;
          }).filter(Boolean).slice(0, 6);
          media = mediaItems.map((item) => item.url);
          const perfil = pj.perfil_completo || {};
          isPrivate = !!perfil.is_private;
        }
      } catch (e) {}

      // 2) Fallback: Instagram web_profile_info (pode exigir login).
      if (!media.length) {
        let user = null;
        for (const endpoint of [
          'https://i.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username),
          'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username),
        ]) {
          try {
            const up = await fetchWithTimeout(endpoint, { headers: igHeaders }, 9000);
            if (up.ok) {
              const json = await up.json();
              user = json && json.data && json.data.user ? json.data.user : null;
              if (user) break;
            } else if (up.status === 429) {
              sendJson(res, 429, { error: 'rate limited' });
              return;
            }
          } catch (e) {}
        }

        const edges = user && user.edge_owner_to_timeline_media && Array.isArray(user.edge_owner_to_timeline_media.edges)
          ? user.edge_owner_to_timeline_media.edges
          : [];

        const pickImage = (node) => {
          if (!node) return '';
          const raw = node.display_url || node.thumbnail_src || node.display_src ||
            (node.image_versions2 && node.image_versions2.candidates && node.image_versions2.candidates[0] && node.image_versions2.candidates[0].url) || '';
          return normalizeNetworkImage(raw);
        };

        mediaItems = edges.map((edge) => {
          const node = edge && edge.node;
          const url = pickImage(node);
          return url ? { url, isVideo: !!(node && (node.is_video || node.media_type === 'VIDEO')) } : null;
        }).filter(Boolean).slice(0, 6);
        media = mediaItems.map((item) => item.url);
        isPrivate = !!(user && user.is_private);
      }

      const payload = { username, isPrivate, count: media.length, media, mediaItems, updatedAt: Date.now() };

      mediaCache.set(cacheKey, { timestamp: Date.now(), data: payload });
      if (mediaCache.size > 300) mediaCache.delete(mediaCache.keys().next().value);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(payload));
      return;
    } catch (error) {
      sendJson(res, 200, { username: sanitizeUsername(url.searchParams.get('username') || ''), isPrivate: false, count: 0, media: [], updatedAt: Date.now(), degraded: true });
      return;
    }
  }

  if (url.pathname === '/api/profile') {
    try {
      const username = sanitizeUsername(url.searchParams.get('username') || '');

      if (!username) {
        sendJson(res, 400, { error: 'missing username' });
        return;
      }

      const cacheKey = username.toLowerCase();
      const cached = profileCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
          'X-Profile-Cache': 'HIT'
        });
        res.end(JSON.stringify(cached.data));
        return;
      }

      // Query Instagram's public web profile endpoint (fast fallback)
      const IG_APP_ID = '936619743392459';
      const apiUrl = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username);

      const results = await Promise.allSettled([
        fetchWithTimeout(apiUrl, {
          headers: {
            'x-ig-app-id': IG_APP_ID,
            'x-asbd-id': '129477',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
          }
        }, 9000),
        fetchProfileViaNetworkProxy(username),
        fetchProfileViaPublicPage(username),
      ]);

      let payload = null;
      const instagramResult = results[0];
      const proxyResult = results[1];
      if (instagramResult.status === 'fulfilled' && instagramResult.value.ok) {
        payload = normalizeProfilePayload(await instagramResult.value.json(), username);
      }
      if (!payload && proxyResult.status === 'fulfilled') {
        payload = normalizeProfilePayload(proxyResult.value, username);
      }
      const publicPageResult = results[2];
      if (!payload && publicPageResult.status === 'fulfilled') {
        payload = publicPageResult.value;
      }

      if (!payload) {
        sendJson(res, 503, { error: 'profile unavailable', username, source: 'degraded' });
        return;
      }

      // A fonte pode encapsular a imagem do CDN em uma URL de proxy. Extraia
      // somente a URL do CDN permitida antes de devolvê-la ao navegador.
      if (payload.photoUrl) {
        payload.photoUrl = normalizeNetworkImage(payload.photoUrl);
      }

      // Save cache
      profileCache.set(cacheKey, { timestamp: Date.now(), data: payload });
      if (profileCache.size > 200) profileCache.delete(profileCache.keys().next().value);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
        'Access-Control-Allow-Origin': '*',
        'X-Profile-Source': 'verified-public',
        'X-Profile-Cache': 'MISS'
      });

      res.end(JSON.stringify(payload));
      return;
    } catch (error) {
      sendJson(res, 502, { error: String(error.message || 'fetch failed') });
      return;
    }
  }

  if (url.pathname === '/api/network') {
    try {
      if (req.method === 'POST') {
        let rawBody = '';
        for await (const chunk of req) rawBody += chunk;
        const body = JSON.parse(rawBody || '{}');
        const username = sanitizeUsername(body.username || '');
        const rawFollowing = Array.isArray(body.following)
          ? body.following
          : (Array.isArray(body.users) ? body.users : []);
        const following = rawFollowing.slice(0, 5000).map(normalizeNetworkUser).filter(Boolean);
        if (!username || !following.length) {
          sendJson(res, 400, { error: 'username and following are required' });
          return;
        }
        const data = {
          username,
          fullName: String(body.fullName || '').trim(),
          photoUrl: normalizeNetworkImage(body.photoUrl || ''),
          following,
          followers: [],
          publicPosts: [],
          source: 'browser-import',
          updatedAt: Date.now(),
        };
        networkCache.set(username.toLowerCase(), { timestamp: Date.now(), data });
        sendJson(res, 200, data);
        return;
      }

      const username = sanitizeUsername(url.searchParams.get('username') || '');
      if (!username) {
        sendJson(res, 400, { error: 'missing username' });
        return;
      }

      const cacheKey = username.toLowerCase();
      const cached = networkCache.get(cacheKey);
      const cacheTtl = cached && cached.data && cached.data.source === 'browser-import' ? 30 * 60 * 1000 : CACHE_TTL;
      if (cached && (Date.now() - cached.timestamp) < cacheTtl) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
          'X-Network-Cache': 'HIT'
        });
        res.end(JSON.stringify(cached.data));
        return;
      }

      if (cached && cached.data) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*',
          'X-Network-Cache': 'STALE'
        });
        res.end(JSON.stringify(cached.data));

        fetchNetworkData(username)
          .then((data) => {
            networkCache.set(cacheKey, { timestamp: Date.now(), data });
            if (networkCache.size > 200) networkCache.delete(networkCache.keys().next().value);
          })
          .catch(() => {});
        return;
      }

      const outcome = await Promise.race([
        fetchNetworkData(username)
          .then((data) => ({ kind: 'data', data }))
          .catch((error) => ({ kind: 'error', error })),
        new Promise((resolve) => setTimeout(() => resolve({ kind: 'timeout' }), 15000)),
      ]);

      if (outcome.kind === 'data' && outcome.data && (
        (outcome.data.following && outcome.data.following.length) ||
        (outcome.data.suggested && outcome.data.suggested.length)
      )) {
        const data = outcome.data;
        networkCache.set(cacheKey, { timestamp: Date.now(), data });
        if (networkCache.size > 200) networkCache.delete(networkCache.keys().next().value);

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*',
          'X-Network-Cache': 'MISS'
        });
        res.end(JSON.stringify(data));
        return;
      }

      if (APIFY_FOLLOWING_ENABLED && process.env.APIFY_API_TOKEN) {
        try {
          const apifyData = await fetchFollowingViaApify(username);
          if (apifyData && apifyData.following.length) {
            networkCache.set(cacheKey, { timestamp: Date.now(), data: apifyData });
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              'Access-Control-Allow-Origin': '*',
              'X-Network-Source': 'apify-following'
            });
            res.end(JSON.stringify(apifyData));
            return;
          }
        } catch (error) {
          console.error('APIFY FOLLOWING ERROR:', error.message);
        }
      }

      // Nunca transforma sugestoes locais em "seguidos". Sem uma fonte real,
      // devolve indisponibilidade para que o front nao atribua perfis errados.
      sendJson(res, 503, {
        error: 'following unavailable',
        username,
        following: [],
        followers: [],
        suggested: outcome.kind === 'data' && outcome.data && outcome.data.suggested
          ? outcome.data.suggested
          : [],
        source: 'unavailable'
      });

      fetchNetworkData(username)
        .then((data) => {
          networkCache.set(cacheKey, { timestamp: Date.now(), data });
          if (networkCache.size > 200) networkCache.delete(networkCache.keys().next().value);
        })
        .catch(() => {});
      return;
    } catch (error) {
      const username = sanitizeUsername(url.searchParams.get('username') || '');
      const cacheKey = username.toLowerCase();
      const cached = networkCache.get(cacheKey);
      if (cached && cached.data) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*',
          'X-Network-Cache': 'STALE-ERROR'
        });
        res.end(JSON.stringify(cached.data));
        return;
      }
      sendJson(res, 502, {
        error: String(error.message || 'fetch failed')
      });
      return;
    }
  }

  const normalizedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const candidate = safeFilePath(root, normalizedPath);

  if (!candidate) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    const indexFile = path.join(candidate, 'index.html');
    if (fs.existsSync(indexFile)) {
      serveStatic(req, res, indexFile);
      return;
    }
  }

  if (fs.existsSync(candidate)) {
    serveStatic(req, res, candidate);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Servidor local rodando em http://localhost:${PORT}`);
});
