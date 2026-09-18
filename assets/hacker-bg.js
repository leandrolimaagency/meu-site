/* =============================================================================
   HACKER-BG - fundo animado roxo (chuva de codigo) para as paginas STALKEA.

   Injeta sozinho um canvas fixo atras do conteudo. Nao precisa de markup:
   basta incluir <script src="assets/hacker-bg.js" defer></script>.

   Cuidados de performance, porque o funil roda em celular e a pagina da VSL
   ja carrega um MP4 pesado:
     - ~18 quadros por segundo (nao 60);
     - devicePixelRatio limitado a 1.5;
     - congela quando a aba sai de foco;
     - respeita prefers-reduced-motion (desenha um quadro estatico).

   O arquivo e ASCII puro de proposito: os glifos katakana sao gerados por
   String.fromCharCode, entao nenhum byte acentuado trafega ate o navegador.
   ============================================================================= */
(function () {
  "use strict";

  // Nas telas que imitam o Instagram (feed/direct/conversa/login) o fundo tem
  // que continuar preto, senao quebra a encenacao. So entra em pagina .wrap.
  if (!document.querySelector(".wrap")) return;

  var COR_RASTRO = "rgba(171, 88, 244, 0.85)";  // --accent-2
  var COR_CABECA = "rgba(226, 200, 255, 0.95)"; // ponta mais clara da coluna
  var PASSO_MS = 1000 / 18;
  var TAM = 15;      // altura da celula em px (define densidade)
  var DPR_MAX = 1.5;

  // Marca o <html>. O CSS usa isso para deixar os cards translucidos SOMENTE
  // onde existe fundo animado -- nas telas que imitam o Instagram o card tem
  // que continuar solido.
  document.documentElement.classList.add("hb-on");

  var caixa = document.createElement("div");
  caixa.id = "hacker-bg";
  caixa.setAttribute("aria-hidden", "true");

  var canvas = document.createElement("canvas");
  caixa.appendChild(canvas);

  // Camadas extras de movimento, todas em CSS (transform/opacity, que rodam na
  // GPU e nao custam quadro de JS): brilho roxo que vagueia e uma varredura
  // descendo, tipo scanner. Sem elas a chuva sozinha parece parada.
  var brilho = document.createElement("div");
  brilho.className = "hb-glow";
  caixa.appendChild(brilho);

  var varredura = document.createElement("div");
  varredura.className = "hb-scan";
  caixa.appendChild(varredura);

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return; // navegador sem canvas: fica so o gradiente do CSS

  function inserir() {
    document.body.insertBefore(caixa, document.body.firstChild);
  }
  if (document.body) inserir();
  else document.addEventListener("DOMContentLoaded", inserir);

  var colunas = 0;
  var gotas = [];
  var velocidades = [];
  var dpr = 1;

  // Cada coluna precisa de uma velocidade propria. Se todas caem no mesmo
  // passo elas ficam em lockstep e a chuva vira uma faixa horizontal descendo
  // junta, em vez de se espalhar pela tela.
  function velocidade() {
    return 0.45 + Math.random() * 0.95;
  }

  function glifo() {
    // 30A0-30FF = katakana; mistura com digitos para dar cara de "codigo"
    return Math.random() < 0.22
      ? String.fromCharCode(48 + Math.floor(Math.random() * 10))
      : String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96));
  }

  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    var l = window.innerWidth;
    var a = window.innerHeight;

    canvas.width = Math.floor(l * dpr);
    canvas.height = Math.floor(a * dpr);
    canvas.style.width = l + "px";
    canvas.style.height = a + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "600 " + TAM + "px ui-monospace, Menlo, Consolas, monospace";
    ctx.textBaseline = "top";

    var novas = Math.ceil(l / TAM);
    gotas.length = 0;
    velocidades.length = 0;
    for (var i = 0; i < novas; i++) {
      // espalha o inicio por toda a altura (e um pouco acima dela)
      gotas.push(Math.random() * (a / TAM) * -1.2);
      velocidades.push(velocidade());
    }
    colunas = novas;

    ctx.clearRect(0, 0, l, a);
  }

  function quadro() {
    var l = window.innerWidth;
    var a = window.innerHeight;

    // rastro: escurece o quadro anterior em vez de limpar
    // (quanto menor o alfa, mais longo o rastro que fica para tras)
    ctx.fillStyle = "rgba(6, 4, 12, 0.11)";
    ctx.fillRect(0, 0, l, a);

    for (var i = 0; i < colunas; i++) {
      var x = i * TAM;
      var y = gotas[i] * TAM;

      ctx.fillStyle = COR_CABECA;
      ctx.fillText(glifo(), x, y);

      ctx.fillStyle = COR_RASTRO;
      ctx.fillText(glifo(), x, y - TAM);

      // recicla a coluna assim que ela passa do rodape: se demorar, boa parte
      // das colunas fica fora da tela e a chuva parece rala no meio da pagina
      if (y > a && Math.random() > 0.92) {
        gotas[i] = -Math.random() * 6;
        velocidades[i] = velocidade();
      } else {
        gotas[i] += velocidades[i];
      }
    }
  }

  var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  var ultimo = 0;
  var rodando = false;
  var id = null;

  function laco(agora) {
    if (!rodando) return;
    id = window.requestAnimationFrame(laco);
    if (agora - ultimo < PASSO_MS) return;
    ultimo = agora;
    quadro();
  }

  function ligar() {
    if (rodando || (reduzir && reduzir.matches)) return;
    rodando = true;
    ultimo = 0;
    id = window.requestAnimationFrame(laco);
  }

  function desligar() {
    rodando = false;
    if (id) window.cancelAnimationFrame(id);
    id = null;
  }

  function iniciar() {
    medir();
    if (reduzir && reduzir.matches) {
      // sem animacao: alguns quadros para deixar um padrao parado e discreto
      for (var i = 0; i < 24; i++) quadro();
      return;
    }
    ligar();
  }

  if (document.body) iniciar();
  else document.addEventListener("DOMContentLoaded", iniciar);

  var t = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(t);
    t = window.setTimeout(function () {
      medir();
      if (reduzir && reduzir.matches) for (var i = 0; i < 24; i++) quadro();
    }, 180);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) desligar();
    else ligar();
  });

  if (reduzir && reduzir.addEventListener) {
    reduzir.addEventListener("change", function () {
      desligar();
      iniciar();
    });
  }
})();
