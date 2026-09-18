# Cloudflare Worker — busca do perfil público (passo 3)

Este Worker permite que o site estático mostre a **foto, nome e contadores públicos**
do @ digitado (para gerar confiança na tela de confirmação). O navegador não consegue
ler o Instagram direto (CORS + login wall), por isso a busca passa por aqui.

> Só é acessada informação **já pública** do perfil. O Worker não faz login e não
> acessa nada privado. Se o Instagram bloquear (rate limit), o site cai automaticamente
> num card de fallback e o funil continua normalmente.

## Deploy rápido (painel da Cloudflare)

1. Acesse **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Create Worker**.
2. Dê um nome (ex.: `instagram-proxy`) e clique em **Deploy** para criar o worker padrão.
3. Clique em **Edit code**, apague o conteúdo e cole tudo de `instagram-proxy.js`.
4. Clique em **Deploy**.
5. Copie a URL final (ex.: `https://instagram-proxy.SEU-SUBDOMINIO.workers.dev`).
6. No site, abra `assets/config.js` e cole essa URL em `WORKER_URL`.

## Deploy via Wrangler (opcional, linha de comando)

```bash
npm install -g wrangler
wrangler login
# na pasta worker/ com um wrangler.toml apontando main = "instagram-proxy.js"
wrangler deploy
```

Exemplo mínimo de `wrangler.toml`:

```toml
name = "instagram-proxy"
main = "instagram-proxy.js"
compatibility_date = "2024-11-01"
```

## Testar

Abra no navegador:

```
https://SEU-WORKER.workers.dev/?username=instagram
```

Deve responder um JSON com `username`, `displayName`, `photoUrl`, `followers`,
`following`, `posts`.

## Observações

- O `x-ig-app-id` usado é o app id público do web client do Instagram; o endpoint
  pode mudar/limitar sem aviso. Por isso o fallback no front é obrigatório (e já existe).
- Para reduzir bloqueios, o Worker já usa cache de 5 min por perfil.
