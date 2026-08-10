/* =============================================================================
   IG-DATA — conteúdo FICTÍCIO para a encenação (stories, feed e direct).
   Nada aqui é real. Pessoas, mensagens e números são inventados.
   ============================================================================= */
window.IG_DATA = {
  stories: ["carla.mendes", "bibi_oliveira", "rafa.personal", "ju.almeida", "marcos.vieira", "bianca.rms", "diego.souza"],

  posts: [
    {
      name: "carla.mendes", place: "Bar do Centro", tag: "📍 marcado neste post",
      likedBy: "rafa.personal", likes: "312", time: "há 2 horas", comments: "42",
      caption: "noite boa demais com quem eu não devia 🙈🔥",
    },
    {
      name: "rafa.personal", place: "Academia Prime", tag: "🎥 vídeo privado",
      likedBy: "bibi_oliveira", likes: "184", time: "há 5 horas", comments: "17",
      caption: "depois te mando o resto no direct 😏",
    },
    {
      name: "ju.almeida", place: "Localização oculta", tag: "🔒 conteúdo sensível",
      likedBy: "diego.souza", likes: "97", time: "ontem", comments: "9",
      caption: "apaga depois de ver, combinado?",
    },
  ],

  conversations: [
    { name: "carla.mendes", verified: false, online: true, preview: "vc tá sozinho agora?", time: "agora", unread: 2, photo: true },
    { name: "bibi_oliveira", verified: false, online: true, preview: "apaga essa conversa depois 🙈", time: "2 min", unread: 1, photo: true },
    { name: "rafa.personal", verified: false, online: false, preview: "te mando a foto que vc pediu", time: "14 min", unread: 3, photo: true, cam: true },
    { name: "lari.costa", verified: false, online: false, preview: "[foto]", time: "1 h", unread: 1, photo: true, cam: true },
    { name: "ju.almeida", verified: false, online: false, preview: "foi muito bom te ver ontem 😏", time: "3 h", unread: 0, photo: true },
    { name: "marcos.vieira", verified: true, online: false, preview: "nossa história fica entre a gente", time: "ontem", unread: 0, photo: true },
    { name: "bianca.rms", verified: false, online: false, preview: "[áudio 0:42]", time: "ontem", unread: 1, photo: true, cam: true },
    { name: "diego.souza", verified: false, online: false, preview: "chega mais tarde igual da última vez", time: "seg", unread: 0, photo: true },
  ],

  /* mensagens por conversa (índice = posição em conversations) */
  threads: {
    0: { status: "Ativo agora", msgs: [
      { from: "them", type: "text", text: "oi sumido, cadê você hoje? 🥺", time: "20:41" },
      { from: "me", type: "text", text: "acabei de chegar, ela já dormiu", time: "20:43" },
      { from: "them", type: "text", text: "vc tá sozinho agora?", time: "20:44" },
      { from: "them", type: "photo", time: "20:45" },
      { from: "me", type: "text", text: "que delícia... apaga depois", time: "20:46" },
      { from: "them", type: "text", text: "vem aqui igual da última vez 🔥", time: "20:47" },
    ]},
    1: { status: "Ativo há 3 min", msgs: [
      { from: "them", type: "text", text: "apaga essa conversa depois 🙈", time: "18:02" },
      { from: "me", type: "text", text: "relaxa, ninguém vê meu cel", time: "18:03" },
      { from: "them", type: "audio", dur: "0:38", time: "18:05" },
      { from: "them", type: "text", text: "foi muito bom ontem no motel", time: "18:06" },
      { from: "me", type: "photo", time: "18:09" },
    ]},
    2: { status: "Ativo há 14 min", msgs: [
      { from: "me", type: "text", text: "me manda aquela foto que vc prometeu", time: "12:20" },
      { from: "them", type: "text", text: "calma que a academia tá cheia 😏", time: "12:22" },
      { from: "them", type: "photo", time: "12:31" },
      { from: "them", type: "text", text: "guarda só pra vc, hein", time: "12:31" },
    ]},
    6: { status: "Ativo há 1 h", msgs: [
      { from: "them", type: "audio", dur: "0:42", time: "22:10" },
      { from: "me", type: "text", text: "adorei ouvir isso 😍", time: "22:14" },
      { from: "them", type: "text", text: "amanhã te mando mais", time: "22:15" },
    ]},
  },
};
