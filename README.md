# STALKEA — Demonstração de Segurança (funil educativo)

Réplica da estrutura do funil "espionar Instagram", **reconstruída como peça de
conscientização**. Ao final, em vez de um checkout, a pessoa cai numa VSL de revelação
que explica que isso é impossível e ensina a não cair no golpe. **Não é para vender nada.**

## Fluxo (6 passos)
1. `index.html` — VSL de qualificação + botão **Espionar agora**
2. `usuario.html` — coleta do @ do Instagram
3. `confirmar.html` — mostra o **perfil público real** (via Worker) para gerar confiança
4. `login.html` — tela de login do IG (cosmética) + animação de "quebra de senha/código"
5. `feed.html` — feed bloqueado + análise dramatizada → botão **Desbloquear**
6. `back-redirect.html` — tela anti-saída (alerta + câmera **simulada** + oferta)

O botão "Desbloquear/Comprar" e os botões do back-redirect vão para `FINAL_URL`
(por ora o stub `revelacao.html`).

## Travas de segurança embutidas
- **A senha nunca é lida, salva ou enviada** — o campo de senha é cosmético; a animação
  ignora o que foi digitado. Nenhuma requisição de rede com credenciais.
- **Sem checkout/pagamento real** — todo botão de conversão leva à revelação.
- **Câmera simulada** — nenhuma webcam é ativada; nada é gravado (sem `getUserMedia`).
- **Perfil só público** — o passo 3 usa apenas dados públicos; o @ é sempre renderizado
  escapado. A "análise" é encenação genérica, sem afirmar fatos sobre a pessoa.
- `noindex,nofollow` em todas as páginas.

## Configuração (arquivo único: `assets/config.js`)
- `WORKER_URL` — URL do Cloudflare Worker (passo 3). Vazio = usa card de fallback.
- `VSL_INICIAL_SRC` — caminho do MP4 da VSL inicial (solte em `assets/video/vsl-inicial.mp4`).
- `FINAL_URL` — destino final. Troque quando a VSL de revelação estiver pronta.

## Como rodar localmente
```bash
python -m http.server 8099
# abra http://localhost:8099
```

## Passo 3 (perfil real)
Precisa do Cloudflare Worker em `worker/` — veja `worker/README.md` para o deploy
(leva ~2 minutos). Depois cole a URL em `WORKER_URL`. Sem isso, o funil funciona
igual, só que o passo 3 mostra um perfil genérico.
