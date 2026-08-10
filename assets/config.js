/* =============================================================================
   CONFIG — pontos que você troca depois. Nada mais precisa ser editado.
   ============================================================================= */
window.STALKEA_CONFIG = {
  /* URL do seu Cloudflare Worker (passo 3 — busca do perfil público).
     Ex.: "https://instagram-proxy.SEU-SUBDOMINIO.workers.dev"
     Enquanto estiver vazio, o passo 3 usa o card de fallback (perfil genérico). */
  WORKER_URL: "/api/profile",

  /* Caminho do MP4 da VSL de qualificação (passo 1). Solte o arquivo aqui. */
  VSL_INICIAL_SRC: "assets/video/vsl-inicial.mp4",

  /* Destino do botão "Desbloquear/Comprar" e dos botões do back-redirect.
     A VSL de revelação ainda está sendo gravada, então aponta para o stub.
     Troque por sua URL final (ou mantenha revelacao.html) quando estiver pronto. */
  FINAL_URL: "https://stalkeaicheckout.lovable.app",
};
