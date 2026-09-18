/* =============================================================================
   CONFIG — pontos que você troca depois. Nada mais precisa ser editado.
   ============================================================================= */
window.STALKEA_CONFIG = {
   /* Usa o host canonico para evitar redirect 307 no fetch cross-origin. */
   API_BASE_URL: "https://www.appstalai.site",

  /* Sempre usa a API do mesmo domínio. O server.js local encaminha essa
     rota para a API publicada, portanto não exige token local nem depende de
     CORS no navegador. */
  WORKER_URL: "/api/profile",

  /* MP4 da VSL de qualificação (passo 1). Fica no Vercel Blob, não no deploy:
     com 96MB ele travava o upload da CLI. Para trocar o vídeo, rode
     `vercel blob put <arquivo> --access public` e cole aqui a URL retornada. */
  VSL_INICIAL_SRC:
    "https://4ixixnkjnzdqjxww.public.blob.vercel-storage.com/vsl-inicial.mp4",

   /* CTA de avaliacao leva ao checkout 2. */
   FINAL_URL: "https://checkoutv2s-807b86ae.vercel.app/",
};
