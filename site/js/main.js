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
      clonado: false,
      // arraste: enquanto o dedo segura, a posição é dele; ao soltar,
      // a velocidade do gesto vira impulso que vai morrendo no laço
      arrastando: false,
      impulso: 0
    };

    medirEsteira(e);
    ligarArraste(caixa, e);
    return e;
  }

  /* Arrastar com o dedo ou o mouse. touch-action: pan-y (no CSS) faz o
     navegador entregar o gesto horizontal aqui e manter o vertical para
     a rolagem da página — os dois convivem no mesmo elemento.         */
  var ATRITO = 2.6;          // quanto maior, mais rápido a inércia morre
  var IMPULSO_MAX = 3200;    // px/s: um arremesso forte, não um tiro

  function ligarArraste(caixa, e) {
    var x0 = 0, desloc0 = 0, xAnt = 0, tAnt = 0, velGesto = 0;

    caixa.addEventListener('pointerdown', function (ev) {
      if (ev.button && ev.button !== 0) return;
      e.arrastando = true;
      e.impulso = 0;
      x0 = xAnt = ev.clientX;
      desloc0 = e.desloc;
      tAnt = ev.timeStamp;
      velGesto = 0;
      caixa.classList.add('arrastando');
      try { caixa.setPointerCapture(ev.pointerId); } catch (err) { /* iOS antigo */ }
    });

    caixa.addEventListener('pointermove', function (ev) {
      if (!e.arrastando) return;
      // dedo para a direita = conteúdo para a direita = desloc menor
      e.desloc = desloc0 - (ev.clientX - x0);
      var dt = ev.timeStamp - tAnt;
      if (dt > 0) {
        // velocidade do gesto, suavizada para o último tranco não mandar sozinho
        var v = (ev.clientX - xAnt) / dt * 1000;
        velGesto = velGesto * 0.6 + v * 0.4;
        xAnt = ev.clientX;
        tAnt = ev.timeStamp;
      }
    });

    function soltar(ev) {
      if (!e.arrastando) return;
      e.arrastando = false;
      caixa.classList.remove('arrastando');
      // gesto parado por mais de 80ms antes de soltar: sem arremesso
      if (ev.timeStamp - tAnt > 80) velGesto = 0;
      e.impulso = Math.max(-IMPULSO_MAX, Math.min(IMPULSO_MAX, -velGesto));
    }
    caixa.addEventListener('pointerup', soltar);
    caixa.addEventListener('pointercancel', soltar);
    caixa.addEventListener('lostpointercapture', soltar);

    // imagem arrastada pelo navegador vira fantasma e rouba o gesto
    caixa.addEventListener('dragstart', function (ev) { ev.preventDefault(); });
  }

  function medirEsteira(e) {
    // Remove clones antigos antes de medir de novo
    while (e.trilha.children.length > e.originais.length) {
      e.trilha.removeChild(e.trilha.lastChild);
    }

    // scrollWidth ignora transform: não precisa zerar para medir, e
    // zerar era o que fazia a esteira pular ao remedir.
    e.largura = e.trilha.scrollWidth;
    if (!e.largura) return;

    // A posição continua de onde estava, só ajustada à largura nova.
    // Antes ela voltava a zero a cada remedição — e no celular rolar
    // dispara resize (a barra de endereço some e volta), então toda
    // rolada reiniciava as esteiras.
    e.desloc = e.desloc % e.largura;

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


  /* ---------- 2b. Progresso por rolagem -----------------------------
     [data-progresso] é uma seção mais alta que a tela com um miolo
     sticky. Conforme ela atravessa a viewport, --p vai de 0 a 1 e os
     [data-etapa] de dentro ganham .ativa um a um. As posições ficam
     em cache; o laço só faz a conta e escreve.                      */

  var progressos = [];

  function ligarProgressos() {
    var caixas = document.querySelectorAll('[data-progresso]');
    for (var i = 0; i < caixas.length; i++) {
      // Só com o efeito ligado o CSS escurece as etapas por acender.
      // Sem JS ou com movimento reduzido, tudo nasce aceso.
      caixas[i].classList.add('progresso-ativo');
      progressos.push({
        el: caixas[i],
        etapas: caixas[i].querySelectorAll('[data-etapa]'),
        topo: 0, trajeto: 1, ultimo: -1
      });
    }
    medirProgressos();
  }

  function medirProgressos() {
    var y = window.scrollY || window.pageYOffset || 0;
    for (var i = 0; i < progressos.length; i++) {
      var p = progressos[i];
      var r = p.el.getBoundingClientRect();
      p.topo = r.top + y;
      // o miolo fica preso enquanto a seção rola por (altura - tela)
      p.trajeto = Math.max(r.height - window.innerHeight, 1);
      p.ultimo = -1;   // força reescrever no próximo quadro
    }
  }

  function avancarProgressos(y) {
    for (var i = 0; i < progressos.length; i++) {
      var p = progressos[i];
      var f = Math.min(Math.max((y - p.topo) / p.trajeto, 0), 1);
      // etapa k acende quando o progresso passa de k / n, com uma
      // folga no fim para a última acender antes de a seção soltar
      var n = p.etapas.length;
      var acesas = Math.min(n, Math.floor(f * (n + 0.35)) + (f > 0 ? 1 : 0));
      if (acesas === p.ultimo) continue;
      p.ultimo = acesas;
      p.el.style.setProperty('--p', (n ? acesas / n : f).toFixed(3));
      for (var k = 0; k < n; k++) {
        if (k < acesas) p.etapas[k].classList.add('ativa');
        else p.etapas[k].classList.remove('ativa');
      }
    }
  }


  /* ---------- 3. Deriva do hero --------------------------------------
     O hero é sticky: sozinho ele travaria de vez assim que encostasse no
     topo, e a seção seguinte pareceria subir sobre um bloco parado. Aqui
     ele continua subindo, mas só numa fração da rolagem — é isso que dá
     a sensação de estar sendo engolido em vez de ter parado.
     A altura fica em cache; o laço só faz aritmética.                  */

  var hero = document.querySelector('.hero');
  var heroAltura = 0;
  var DERIVA = 0.28;   // sobe 28% da própria altura ao longo do trajeto

  function medirHero() {
    heroAltura = hero ? hero.offsetHeight : 0;
  }

  function derivarHero(y) {
    if (!hero || !heroAltura) return;
    var p = y / heroAltura;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    hero.style.transform =
      'translate3d(0,' + (-(p * heroAltura * DERIVA)).toFixed(2) + 'px,0)';
  }


  /* ---------- 4. Lenis (opcional) ------------------------------------
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


  /* ---------- 5. O laço único ---------------------------------------
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
    derivarHero(y);
    avancarProgressos(y);

    for (var i = 0; i < esteiras.length; i++) {
      var e = esteiras[i];
      if (!e.largura) continue;

      if (!e.arrastando) {
        e.desloc += (e.velocidade + e.impulso) * dt;
        // a inércia decai exponencialmente; a velocidade de cruzeiro
        // continua por baixo, então a esteira nunca "para e volta"
        if (e.impulso) {
          e.impulso *= Math.exp(-ATRITO * dt);
          if (Math.abs(e.impulso) < 2) e.impulso = 0;
        }
      }

      // laço: volta ao início ao completar um conjunto
      if (e.desloc >= e.largura) e.desloc -= e.largura;
      if (e.desloc < 0) e.desloc += e.largura;

      e.trilha.style.transform =
        'translate3d(' + (-e.desloc).toFixed(2) + 'px,0,0)';
    }

    requestAnimationFrame(laco);
  }


  /* ---------- 6. Resize: remedir, nunca dentro do laço -------------- */

  var timerResize;
  var larguraMedida = 0;

  // `forcar` ignora a checagem de largura: usado quando a página foi
  // medida escondida (aba em segundo plano) e tudo pode estar errado.
  function aoRedimensionar(forcar) {
    clearTimeout(timerResize);
    timerResize = setTimeout(function () {
      // Nada aqui depende da altura da janela. Se só ela mudou — a
      // barra de endereço do celular ao rolar, por exemplo — não há o
      // que remedir, e remedir à toa é o que fazia as esteiras pularem.
      var largura = window.innerWidth;
      if (forcar !== true && largura === larguraMedida) return;
      larguraMedida = largura;

      for (var i = 0; i < esteiras.length; i++) medirEsteira(esteiras[i]);
      medirPendentes();
      medirHero();
      medirProgressos();
    }, 180);
  }


  /* ---------- 7. Miudezas -------------------------------------------- */

  // Foto de cliente que não decodifica sai de cena: o span guarda as
  // iniciais em data-inicial, então a lista continua legível.
  function blindarFotos() {
    var fotos = document.querySelectorAll('.cliente__foto img');
    for (var i = 0; i < fotos.length; i++) {
      (function (img) {
        if (img.complete && img.naturalWidth === 0) { img.remove(); return; }
        img.addEventListener('error', function () { img.remove(); });
      })(fotos[i]);
    }
  }


  function ano() {
    var el = document.querySelector('[data-ano]');
    if (el) el.textContent = String(new Date().getFullYear());
  }


  /* ---------- Início -------------------------------------------------- */

  function iniciar() {
    ano();
    blindarFotos();

    // A partir daqui o CSS pode animar. Se este arquivo falhar antes,
    // .reveal nunca fica invisível e a página segue inteira.
    raiz.classList.add('anim-pronta');

    ligarRevelacao();

    if (semMovimento.matches) return;   // sem loop, sem esteira

    ligarLenis();
    ligarEsteiras();
    ligarProgressos();
    medirHero();

    window.addEventListener('resize', function () { aoRedimensionar(false); }, { passive: true });

    // Uma aba aberta em segundo plano mede tudo com a janela em 0x0: as
    // posições em cache saem erradas e o observer nem chega a disparar.
    // Quando ela aparece, remedimos antes que a varredura use lixo.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') aoRedimensionar(true);
    });

    requestAnimationFrame(laco);
  }

  // As imagens mudam a largura das esteiras; medimos depois do load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
  // As imagens mudam a largura das esteiras: remede quando todas chegam.
  window.addEventListener('load', function () { aoRedimensionar(true); });

})();
