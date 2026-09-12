/* ============================================================
   Página de proposta — o pouco que ela tem além do main.js.

   Copiar dados de pagamento: um botão por valor e um para tudo.
   Sem clipboard (http, navegador velho), seleciona o texto para
   o Ctrl+C manual — nunca falha em silêncio.
   ============================================================ */
(function () {
  'use strict';

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise(function (ok, erro) {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? ok() : erro(); }
      catch (e) { erro(e); }
      ta.remove();
    });
  }

  function avisar(botao, texto) {
    var rot = botao.querySelector('span');
    var antes = rot ? rot.textContent : '';
    botao.classList.add('copiado');
    if (rot) rot.textContent = texto;
    clearTimeout(botao._t);
    botao._t = setTimeout(function () {
      botao.classList.remove('copiado');
      if (rot) rot.textContent = antes;
    }, 1600);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copiar], [data-copiar-tudo]');
    if (!b) return;
    e.preventDefault();

    var texto;
    if (b.hasAttribute('data-copiar-tudo')) {
      // "Rótulo: valor" por linha — cola limpo num e-mail ou no banco
      texto = Array.prototype.map.call(
        b.closest('.prop-campo').querySelectorAll('.prop-conta > div'),
        function (d) {
          return d.querySelector('dt').textContent.trim() + ': ' + d.querySelector('.prop-conta__valor').textContent.trim();
        }
      ).join('\n');
    } else {
      texto = b.getAttribute('data-copiar');
    }

    copiar(texto).then(
      function () { avisar(b, 'Copiado'); },
      function () { avisar(b, 'Selecione e copie'); }
    );
  });

  /* "Tenho dúvidas" abre a seção de perguntas, que nasce escondida.
     Na fase de captura, de propósito: o main.js já prendeu um clique
     nas âncoras que manda o Lenis rolar até o alvo — se o alvo ainda
     estiver display:none nessa hora, ele rola para o lugar errado.
     Aqui a seção aparece antes; depois cada um faz a sua parte (o
     Lenis rola no desktop; no celular vale a âncora nativa). */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-duvidas]');
    if (!b) return;
    var faq = document.getElementById('duvidas');
    if (!faq) return;
    faq.classList.add('aberto');
    b.setAttribute('aria-expanded', 'true');
    var primeira = faq.querySelector('details');
    if (primeira && !faq.querySelector('details[open]')) primeira.open = true;
  }, true);
})();
