/* =============================================================================
   IG-DATA — conteúdo gerado dinamicamente a partir do username do lead.
   Mantém o funil educativo sem depender de senha real, sessão do Instagram ou
   qualquer tipo de automação autenticada.
   ============================================================================= */
(function () {
  function normalizeSeed(raw) {
    return String(raw || "perfil")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9._]/g, "")
      .toLowerCase()
      .slice(0, 20) || "perfil";
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function displayNameFromName(username) {
    return username.split(".").map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(" ");
  }

  function randomFromSeed(list, seed, index) {
    return list[(hash(seed + ":" + index) % list.length + list.length) % list.length];
  }

  var FOLLOWING_BASE = [
    { username: "anaduartedsg", fullName: "Ana Duarte | Web", profilePicUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "infinityleads_", fullName: "Infinity Leads | Marketing", profilePicUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "corretoraabrsaude", fullName: "Corretora ABR Saúde", profilePicUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "tzviagens.taylone", fullName: "TZ Viagens Taylone", profilePicUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVerified: true, isPrivate: false },
    { username: "tntsportsbr", fullName: "TNT Sports Brasil", profilePicUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80", isVerified: true, isPrivate: false },
    { username: "fatosdesconhecidos", fullName: "Fatos Desconhecidos", profilePicUrl: "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=400&q=80", isVerified: true, isPrivate: false },
    { username: "drissshaida", fullName: "Shaida Driss", profilePicUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "jewagem.khazz", fullName: "JEWAGEM.KHAZZ", profilePicUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "bilalhimmou___1", fullName: "Bilal Himmou", profilePicUrl: "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "camila.souza", fullName: "Camila Souza", profilePicUrl: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "beatriz.moura", fullName: "Beatriz Moura", profilePicUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "thiago.ferreira", fullName: "Thiago Ferreira", profilePicUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "natalia.lima", fullName: "Nathalia Lima", profilePicUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "marcos.oliveira", fullName: "Marcos Oliveira", profilePicUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "bianca.alves", fullName: "Bianca Alves", profilePicUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "gabriela.mendes", fullName: "Gabriela Mendes", profilePicUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "ana.costa", fullName: "Ana Costa", profilePicUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "pedro.rocha", fullName: "Pedro Rocha", profilePicUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false },
    { username: "laura.santos", fullName: "Laura Santos", profilePicUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVerified: false, isPrivate: false }
  ];

  function buildFollowing(seed, limit) {
    var list = [];
    var seen = {};
    var index = 0;
    while (list.length < limit && index < 500) {
      var item = FOLLOWING_BASE[(hash(seed + ":following:" + index) % FOLLOWING_BASE.length + FOLLOWING_BASE.length) % FOLLOWING_BASE.length];
      index += 1;
      if (seen[item.username]) continue;
      seen[item.username] = true;
      list.push({
        username: item.username,
        fullName: item.fullName || displayNameFromName(item.username),
        profilePicUrl: item.profilePicUrl,
        isVerified: !!item.isVerified,
        isPrivate: !!item.isPrivate,
        followedBy: seed,
        city: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Salvador"][index % 5],
        online: index % 3 !== 0,
        story: true
      });
    }
    return list;
  }

  function buildThread(name, idx, baseSeed) {
    var templates = [
      { status: "Ativo agora", msgs: [
        { from: "them", type: "text", text: "vi que você me segue também", time: "20:41" },
        { from: "me", type: "text", text: "sim, seu perfil apareceu no meu feed", time: "20:43" },
        { from: "them", type: "text", text: "me responde no direct que eu tenho algo pra te mostrar", time: "20:44" },
        { from: "them", type: "photo", time: "20:45" },
        { from: "me", type: "text", text: "manda mais depois", time: "20:46" },
        { from: "them", type: "text", text: "vou te mandar mais coisa hoje", time: "20:47" }
      ] },
      { status: "Ativo há 3 min", msgs: [
        { from: "them", type: "text", text: "te mandei aquele story do horário do almoço", time: "18:02" },
        { from: "me", type: "text", text: "vi, gostei muito", time: "18:03" },
        { from: "them", type: "audio", dur: "0:38", time: "18:05" },
        { from: "them", type: "text", text: "a gente tem muita coisa em comum", time: "18:06" },
        { from: "me", type: "photo", time: "18:09" }
      ] },
      { status: "Ativo há 14 min", msgs: [
        { from: "me", type: "text", text: "me manda a história que você falou", time: "12:20" },
        { from: "them", type: "text", text: "calma, gente do mesmo círculo", time: "12:22" },
        { from: "them", type: "photo", time: "12:31" },
        { from: "them", type: "text", text: "você vai gostar do que eu te mando", time: "12:31" }
      ] },
      { status: "Ativo há 1 h", msgs: [
        { from: "them", type: "audio", dur: "0:42", time: "22:10" },
        { from: "me", type: "text", text: "to ouvindo, continua", time: "22:14" },
        { from: "them", type: "text", text: "amanhã a gente conversa mais", time: "22:15" }
      ] }
    ];

    var pick = templates[(hash(baseSeed + ":" + name + ":" + idx) % templates.length + templates.length) % templates.length];
    return pick;
  }

  var seed = normalizeSeed((window.StalkeaFunnel && window.StalkeaFunnel.getUsername && window.StalkeaFunnel.getUsername()) || (typeof location !== "undefined" ? location.search : "") || "perfil");

  // Gera seguidos com NOMES DE PESSOAS naturais (consistentes por @ via seed),
  // parecendo o círculo social real do perfil pesquisado.
  function buildPersonalizedFollowing(seed, base) {
    var firstNames = ["Ana", "Bruna", "Camila", "Juliana", "Fernanda", "Larissa", "Beatriz", "Gabriela", "Mariana", "Rafaela", "Pedro", "Thiago", "Lucas", "Rafael", "Bruno", "Felipe", "Leticia", "Patricia", "Vanessa", "Amanda"];
    var lastNames = ["silva", "souza", "oliveira", "santos", "costa", "ferreira", "almeida", "pereira", "carvalho", "rodrigues", "lima", "gomes", "martins", "rocha", "alves", "barbosa"];
    var pics = [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80"
    ];
    function pick(list, tag, i) {
      return list[(hash(seed + ":" + tag + ":" + i) % list.length + list.length) % list.length];
    }
    var seen = {};
    var custom = [];
    for (var i = 0; i < 8 && custom.length < 8; i++) {
      var fn = pick(firstNames, "fn", i);
      var ln = pick(lastNames, "ln", i);
      var sep = (hash(seed + ":sep:" + i) % 2) ? "." : "_";
      var uname = (fn + sep + ln + ((hash(seed + ":n:" + i) % 90) + 10)).toLowerCase();
      if (seen[uname]) continue;
      seen[uname] = true;
      custom.push({
        username: uname,
        fullName: fn + " " + ln.charAt(0).toUpperCase() + ln.slice(1),
        profilePicUrl: pick(pics, "pic", i),
        isVerified: false,
        isPrivate: i % 3 === 2
      });
    }
    return custom.concat(base || []);
  }

  var baseFollowing = buildFollowing(seed, 12);
  var blockedGeneratedUsers = {
    "gabriela.rocha71": true,
    "mariana_lima72": true,
    "larissa.pereira69": true,
    "beatriz_costa70": true,
    "thiago.souza67": true,
    "lucas_alves68": true,
    "rafaela.gomes65": true,
    "pedro_carvalho66": true
  };
  var following = buildPersonalizedFollowing(seed, baseFollowing).filter(function (person) {
    return !blockedGeneratedUsers[String(person.username || "").toLowerCase()];
  });
  var people = following.map(function (person, idx) {
    return {
      name: person.username,
      displayName: person.fullName,
      city: person.city || ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Salvador"][idx % 5],
      story: true,
      profilePicUrl: person.profilePicUrl,
      isVerified: !!person.isVerified,
      isPrivate: !!person.isPrivate
    };
  });
  var stories = following.slice(0, 7).map(function (person) {
    return person.username;
  });

  var posts = following.slice(0, 4).map(function (person, idx) {
    return {
      name: person.username,
      place: ["Bar do Centro", "Academia Prime", "Localização oculta", "Praia de Copacabana"][idx % 4],
      tag: ["📍 marcado neste post", "🎥 vídeo privado", "🔒 conteúdo sensível", "📷 foto recente"][idx % 4],
      likedBy: (following[(idx + 2) % following.length] || person).username,
      likes: ["312", "184", "97", "235"][idx % 4],
      time: ["há 2 horas", "há 5 horas", "ontem", "ontem"][idx % 4],
      comments: ["42", "17", "9", "26"][idx % 4],
      caption: ["noite boa demais com quem eu não devia 🙈🔥", "depois te mando o resto no direct 😏", "apaga depois de ver, combinado?", "essa semana foi boa demais, mas ainda não acabou 😏"][idx % 4]
    };
  });

  var conversations = following.slice(0, 12).map(function (person, idx) {
    return {
      name: person.username,
      verified: person.isVerified,
      online: idx % 2 === 0,
      preview: idx % 2 === 0 ? "vc tá sozinho agora?" : "te mandei algo hoje",
      time: idx === 0 ? "agora" : idx === 1 ? "2 min" : idx === 2 ? "14 min" : idx === 3 ? "1 h" : idx === 4 ? "3 h" : "ontem",
      unread: idx === 0 ? 2 : idx === 1 ? 1 : idx === 2 ? 3 : 0,
      photo: true,
      cam: idx === 2 || idx === 6,
      profilePicUrl: person.profilePicUrl,
      fullName: person.fullName
    };
  });

  var threads = {};
  conversations.forEach(function (contact, idx) {
    threads[idx] = buildThread(contact.name, idx, seed);
  });

  window.IG_DATA = {
    seed: seed,
    following: following,
    people: people,
    stories: stories,
    posts: posts,
    conversations: conversations,
    threads: threads
  };
})();
