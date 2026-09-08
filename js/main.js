/* ============================================================
   MAIN — todo o comportamento do site.

   Regras da casa:
   · Um único requestAnimationFrame alimenta todos os efeitos de
     rolagem. Vários listeners de scroll concorrentes é o que trava
     esse tipo de página.
   · O JS só acrescenta. Sem ele a página continua inteira e
     navegável — as animações dependem da classe .anim-pronta, que
     este arquivo é quem adiciona.
   · Medidas de layout ficam em cache e só são recalculadas no
     resize. Ler o layout dentro do loop causa thrashing.
   ============================================================ */

(function () {
  'use strict';

  var raiz = document.documentElement;

  /* Usuário pediu menos movimento? Então nada de loop.
     A página continua completa, só que parada.                     */
  var semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');


  /* ---------- utilidades ------------------------------------------ */

  // atual + (alvo - atual) * fator
  function lerp(atual, alvo, fator) {
    return atual + (alvo - atual) * fator;
  }

  var FATOR = parseFloat(
    getComputedStyle(raiz).getPropertyValue('--lerp')
  ) || 0.085;


  /* ---------- 1. Revelação ao entrar em cena ----------------------
     IntersectionObserver dispara a revelação. Mas o observer só
     entrega mudanças que ele chega a amostrar: uma rolagem muito
     rápida, um salto de âncora ou a restauração de posição no reload
     podem pular um bloco — e um bloco pulado ficaria invisível para
     sempre. Por isso a lista de pendentes também é varrida dentro do
     laço, comparando posições em cache (aritmética pura, sem leitura
     de layout). O observer dá o tempo bonito; a varredura garante que
     nada se perca.                                                  */

  var pendentes = [];      // { el, topo }
  var alturaTela = window.innerHeight;

  function mostrar(el) { el.classList.add('vis'); }

  function ligarRevelacao() {
    var alvos = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!alvos.length) return;

    if (!('IntersectionObserver' in window) || semMovimento.matches) {
      for (var i = 0; i < alvos.length; i++) mostrar(alvos[i]);
      return;
    }

    for (var j = 0; j < alvos.length; j++) pendentes.push({ el: alvos[j], topo: 0 });
    medirPendentes();

    var obs = new IntersectionObserver(function (entradas) {
      for (var k = 0; k < entradas.length; k++) {
        if (entradas[k].isIntersecting) {
          mostrar(entradas[k].target);
          obs.unobserve(entradas[k].target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });

    for (var m = 0; m < alvos.length; m++) obs.observe(alvos[m]);
  }

  function medirPendentes() {
    alturaTela = window.innerHeight;
    var y = window.scrollY || window.pageYOffset || 0;
    for (var i = 0; i < pendentes.length; i++) {
      pendentes[i].topo = pendentes[i].el.getBoundingClientRect().top + y;
    }
  }

  // Roda no laço: nenhuma leitura de layout, só comparação de números.
  function varrerPendentes(y) {
    if (!pendentes.length) return;
    // 0.9 espelha o rootMargin de -10% do observer: os dois disparam
    // no mesmo ponto, então tanto faz quem chega primeiro.
    var limite = y + alturaTela * 0.9;
    for (var i = pendentes.length - 1; i >= 0; i--) {
      var p = pendentes[i];
      if (p.el.classList.contains('vis')) { pendentes.splice(i, 1); continue; }
      if (p.topo < limite) { mostrar(p.el); pendentes.splice(i, 1); }
    }
  }


  /* ---------- 2. Esteiras (marquees) -------------------------------
     A trilha é duplicada até cobrir duas vezes a viewport, para o
     laço não mostrar buraco. A largura de um conjunto fica em cache;
     o loop só escreve transform.                                    */

  var esteiras = [];

  function montarEsteira(caixa, velocidade) {
    var trilha = caixa.querySelector('[data-trilha]');
    if (!trilha) return null;

    var originais = Array.prototype.slice.call(trilha.children);
    if (!originais.length) return null;

    var e = {
      trilha: trilha,
      originais: originais,
      velocidade: velocidade,   // px por segundo
      largura: 0,
      desloc: 0,
      clonado: false
    };

    medirEsteira(e);
    return e;
  }

  function medirEsteira(e) {
    // Remove clones antigos antes de medir de novo
    while (e.trilha.children.length > e.originais.length) {
      e.trilha.removeChild(e.trilha.lastChild);
    }
    e.trilha.style.transform = 'translate3d(0,0,0)';

    e.largura = e.trilha.scrollWidth;
    if (!e.largura) return;

    // Duplica até cobrir a trilha original + uma viewport de folga
    var precisa = e.largura + window.innerWidth;
    var atual = e.largura;
    while (atual < precisa) {
      for (var i = 0; i < e.originais.length; i++) {
        var c = e.originais[i].cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        e.trilha.appendChild(c);
      }
      atual += e.largura;
    }
  }

  // Qualquer elemento com [data-esteira] vira uma esteira. A velocidade
  // vem de data-velocidade (px/s); negativa anda no sentido contrário.
  function ligarEsteiras() {
    var caixas = document.querySelectorAll('[data-esteira]');
    for (var i = 0; i < caixas.length; i++) {
      var vel = parseFloat(caixas[i].getAttribute('data-velocidade'));
      if (isNaN(vel)) vel = 46;
      var e = montarEsteira(caixas[i], vel);
      if (e) esteiras.push(e);
    }
  }


  /* ---------- 3. Lenis (opcional) ------------------------------------
     ~3 KB, só inércia de rolagem. Se o CDN cair ou o usuário pedir
     menos movimento, a rolagem nativa assume e nada quebra.          */

  var lenis = null;

  function ligarLenis() {
    if (semMovimento.matches) return;
    if (typeof window.Lenis !== 'function') return;   // CDN fora do ar

    try {
      lenis = new window.Lenis({
        duration: 1.05,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        touchMultiplier: 1.6
      });
    } catch (err) {
      lenis = null;   // qualquer problema: rolagem nativa
    }

    if (!lenis) return;

    // Lenis assume a posição de rolagem: quem quiser mover a página por
    // fora (dev tools, script de terceiro) precisa falar com ele.
    window.lenis = lenis;

    // Âncoras passam a usar a rolagem suave do Lenis
    var ancoras = document.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < ancoras.length; i++) {
      ancoras[i].addEventListener('click', function (ev) {
        var id = this.getAttribute('href');
        if (!id || id === '#') return;
        var alvo = document.querySelector(id);
        if (!alvo) return;
        ev.preventDefault();
        lenis.scrollTo(alvo, { offset: -80 });
      });
    }
  }


  /* ---------- 4. O laço único ---------------------------------------
     Uma chamada de rAF alimenta esteiras + nav. Nada mais escuta
     scroll.                                                          */

  var anterior = 0;
  var yLerp = 0;

  function laco(agora) {
    if (lenis) lenis.raf(agora);

    var dt = anterior ? Math.min((agora - anterior) / 1000, 0.05) : 0.016;
    anterior = agora;

    // scrollY suavizado — usado pela velocidade das esteiras
    var y = window.scrollY || window.pageYOffset || 0;
    yLerp = lerp(yLerp, y, FATOR);

    varrerPendentes(y);

    for (var i = 0; i < esteiras.length; i++) {
      var e = esteiras[i];
      if (!e.largura) continue;

      e.desloc += e.velocidade * dt;

      // laço: volta ao início ao completar um conjunto
      if (e.desloc >= e.largura) e.desloc -= e.largura;
      if (e.desloc < 0) e.desloc += e.largura;

      e.trilha.style.transform =
        'translate3d(' + (-e.desloc).toFixed(2) + 'px,0,0)';
    }

    requestAnimationFrame(laco);
  }


  /* ---------- 5. Resize: remedir, nunca dentro do laço -------------- */

  var timerResize;
  function aoRedimensionar() {
    clearTimeout(timerResize);
    timerResize = setTimeout(function () {
      for (var i = 0; i < esteiras.length; i++) {
        esteiras[i].desloc = 0;
        medirEsteira(esteiras[i]);
      }
      medirPendentes();
    }, 180);
  }


  /* ---------- 6. Miudezas -------------------------------------------- */

  function ano() {
    var el = document.querySelector('[data-ano]');
    if (el) el.textContent = String(new Date().getFullYear());
  }


  /* ---------- Início -------------------------------------------------- */

  function iniciar() {
    ano();

    // A partir daqui o CSS pode animar. Se este arquivo falhar antes,
    // .reveal nunca fica invisível e a página segue inteira.
    raiz.classList.add('anim-pronta');

    ligarRevelacao();

    if (semMovimento.matches) return;   // sem loop, sem esteira

    ligarLenis();
    ligarEsteiras();

    window.addEventListener('resize', aoRedimensionar, { passive: true });

    // Uma aba aberta em segundo plano mede tudo com a janela em 0x0: as
    // posições em cache saem erradas e o observer nem chega a disparar.
    // Quando ela aparece, remedimos antes que a varredura use lixo.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') aoRedimensionar();
    });

    requestAnimationFrame(laco);
  }

  // As imagens mudam a largura das esteiras; medimos depois do load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
  window.addEventListener('load', aoRedimensionar);

})();
