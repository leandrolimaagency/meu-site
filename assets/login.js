/* =============================================================================
   LOGIN — encenação de "quebra de senha/código".
   IMPORTANTE (trava de segurança): o que o usuário digita NÃO é lido, salvo
   nem enviado. A animação abaixo é 100% independente do input. Nenhuma
   requisição de rede com credenciais acontece aqui.
   ============================================================================= */
(function () {
  var F = window.StalkeaFunnel;
  F.armBackRedirect();

  var username = F.getUsername();
  if (username) {
    var uField = document.getElementById("ig-user");
    if (uField) uField.value = username;
  }

  var overlay = document.getElementById("crack");
  var statusEl = document.getElementById("crack-status");
  var attemptEl = document.getElementById("crack-attempt");
  var fill = document.getElementById("crack-fill");
  var pctEl = document.getElementById("crack-pct");

  function randPass() {
    var n = 6 + Math.floor(Math.random() * 5);
    return "•".repeat(n);
  }

  var phases = [
    "Estabelecendo conexão segura...",
    "Testando combinações de senha...",
    "Quebrando a criptografia...",
    "Lendo código de verificação...",
    "Ignorando autenticação em duas etapas...",
    "Acesso concedido. Redirecionando...",
  ];

  var running = false;
  function startCrack() {
    if (running) return;
    running = true;
    overlay.classList.remove("hidden");

    var start = Date.now();
    var duration = 4200; // ms
    var totalAttempts = 500;

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
        attemptEl.textContent = "Acesso concedido ✓";
        setTimeout(function () {
          window.location.href = F.withUsername("feed.html", username);
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
  if (passField) passField.value = "••••••••••";
  setTimeout(startCrack, 1400);
})();
