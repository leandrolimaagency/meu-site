/* =============================================================================
   LOGIN — encenação de "quebra de senha/código".
   IMPORTANTE (trava de segurança): o que o usuário digita NÃO é lido, salvo
   nem enviado. A animação abaixo é 100% independente do input. Nenhuma
   requisição de rede com credenciais acontece aqui.
   ============================================================================= */
(function () {
  var F = window.StalkeaFunnel;
  F.armBackRedirect();
  var uField = document.getElementById("ig-user");

  var username = F.getUsername();
  if (username) {
    if (uField) uField.value = username;
  }

  var overlay = document.getElementById("crack");
  var statusEl = document.getElementById("crack-status");
  var attemptEl = document.getElementById("crack-attempt");
  var fill = document.getElementById("crack-fill");
  var pctEl = document.getElementById("crack-pct");

  function randPass() {
    var n = 6 + Math.floor(Math.random() * 5);
    return "\u2022".repeat(n);
  }

  var phases = [
    "Estabelecendo conex\u00E3o segura...",
    "Testando combina\u00E7\u00F5es de senha...",
    "Quebrando a criptografia...",
    "Lendo c\u00F3digo de verifica\u00E7\u00E3o...",
    "Ignorando autentica\u00E7\u00E3o em duas etapas...",
    "Acesso concedido. Redirecionando...",
  ];

  var running = false;

  function saveWarmNetwork(username, people) {
    try {
      var key = "stalkea_network_v2_" + username;
      var payload = JSON.stringify({ ts: Date.now(), people: people });
      sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    } catch (e) {}
  }

  function warmNetwork(username) {
    if (!username) return Promise.resolve();

    return new Promise(function (resolve) {
      var settled = false;
      var finish = function () {
        if (settled) return;
        settled = true;
        resolve();
      };

      var timer = setTimeout(finish, 4800);
      fetch(F.apiUrl('/api/network?username=' + encodeURIComponent(username) + '&v=3'), { method: 'GET', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          if (F.sanitizeUsername(data.username || '') !== username) return;
          var list = [];
          if (Array.isArray(data.following)) list = list.concat(data.following);
          if (Array.isArray(data.followers)) list = list.concat(data.followers);
          var seen = {};
          list = list.filter(function (p) {
            var u = F.sanitizeUsername(p && p.username);
            if (!u || seen[u]) return false;
            seen[u] = true;
            p.username = u;
            return true;
          });
          if (list.length) saveWarmNetwork(username, list);
        })
        .catch(function () {})
        .finally(function () {
          clearTimeout(timer);
          finish();
        });
    });
  }

  function startCrack() {
    if (running) return;
    running = true;
    overlay.classList.remove("hidden");

    var start = Date.now();
    var duration = 4200; // ms
    var totalAttempts = 500;
    var warmPromise = warmNetwork(F.sanitizeUsername((uField && uField.value) || username));

    var attemptTimer = setInterval(function () {
      var current = 1 + Math.floor(Math.random() * totalAttempts);
      attemptEl.textContent = "Tentando senha " + current + "/" + totalAttempts + "  " + randPass();
    }, 120);

    var progressTimer = setInterval(function () {
      var elapsed = Date.now() - start;
      var ratio = Math.min(1, elapsed / duration);
      var pct = Math.floor(ratio * 100);
      fill.style.width = pct + "%";
      pctEl.textContent = pct + "%";

      var phaseIndex = Math.min(phases.length - 1, Math.floor(ratio * phases.length));
      statusEl.textContent = phases[phaseIndex];

      if (ratio >= 1) {
        clearInterval(progressTimer);
        clearInterval(attemptTimer);
        attemptEl.textContent = "Acesso concedido \u2713";
        setTimeout(function () {
          var currentUsername = F.sanitizeUsername((uField && uField.value) || username);
          if (currentUsername) {
            F.setUsername(currentUsername);
          }
          Promise.resolve(warmPromise).finally(function () {
            window.location.href = F.withUsername("feed.html", currentUsername || username);
          });
        }, 700);
      }
    }, 90);
  }

  document.getElementById("ig-form").addEventListener("submit", function (e) {
    e.preventDefault();
    // NÃO lemos e.target elements de senha. Apenas disparamos a animação.
    startCrack();
  });

  // Req 2: o usuário NÃO precisa digitar senha. Preenche a senha visualmente
  // (dots cosméticos, nunca lidos) e inicia a quebra automaticamente.
  var passField = document.getElementById("ig-pass");
  if (passField) passField.value = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  setTimeout(startCrack, 1400);
})();
