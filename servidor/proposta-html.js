/* ============================================================
   Monta a página de uma proposta a partir do JSON.

   A proposta não é um arquivo HTML solto: é um registro. Isso
   permite duplicar para outro cliente, corrigir um valor e
   republicar sem mexer em markup — e é o que o painel edita.

   O visual sai do mesmo tokens.css do site. Nenhuma cor ou
   medida crua aqui: se a marca mudar, a proposta acompanha.
   ============================================================ */

import { escapar } from './listas.js';

const V = 'p1';   // versão do proposta.css, para o cache

const linhas = (t) => String(t || '').split('\n').filter((l) => l.trim());

/* Um bloco só aparece se tiver conteúdo. Proposta sem seção de
   pagamento não deve renderizar um título órfão.

   O segundo argumento é uma função de propósito: passando o
   template pronto, ele seria montado antes desta chamada e um
   `pag.forma` com `pag` ausente derrubaria a página inteira — o
   guarda não guardaria nada. Assim o HTML só é construído quando
   já se sabe que há o que construir. */
const talvez = (cond, montar) => (cond ? (typeof montar === 'function' ? montar() : montar) : '');

function secEscopo(itens) {
  if (!Array.isArray(itens) || !itens.length) return '';
  return `
  <section class="section prop-escopo" id="escopo">
    <div class="wrap">
      <p class="eyebrow reveal">Escopo</p>
      <ol class="prop-lista">
        ${itens.map((it, i) => `
        <li class="prop-item reveal" style="--delay:${(i * 0.06).toFixed(2)}s">
          <span class="prop-item__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <div class="prop-item__corpo">
            <h3 class="h3 prop-item__titulo">${escapar(it.titulo || '')}</h3>
            ${talvez(it.descricao, () => `<p class="body prop-item__desc">${escapar(it.descricao)}</p>`)}
          </div>
          ${talvez(it.marca, () => `<span class="prop-item__marca">${escapar(it.marca)}</span>`)}
        </li>`).join('')}
      </ol>
    </div>
  </section>`;
}

function secInclui(bloco) {
  if (!bloco) return '';
  const soltos = Array.isArray(bloco.itens) ? bloco.itens : [];
  const grupos = Array.isArray(bloco.grupos) ? bloco.grupos : [];
  if (!soltos.length && !grupos.length) return '';

  const marcar = (t) => `<li class="prop-check">${escapar(t)}</li>`;

  return `
  <section class="section section--tight band-invert prop-inclui">
    <div class="wrap">
      <p class="eyebrow on-dark reveal">${escapar(bloco.titulo || 'Cada entregável inclui')}</p>
      <div class="prop-inclui__grade">
        ${talvez(soltos.length, () => `<ul class="prop-checks reveal">${soltos.map(marcar).join('')}</ul>`)}
        ${grupos.map((g) => `
        <div class="prop-grupo reveal">
          <p class="small prop-grupo__titulo">${escapar(g.titulo || '')}</p>
          <ul class="prop-checks">${(g.itens || []).map(marcar).join('')}</ul>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function secInvestimento(inv, pag) {
  if (!inv && !pag) return '';
  return `
  <section class="section prop-investimento" id="investimento">
    <div class="wrap prop-investimento__grade">

      ${talvez(inv, () => `
      <div class="prop-valor reveal">
        <span class="rule rule--strong" aria-hidden="true"></span>
        <p class="eyebrow">${escapar(inv?.rotulo || 'Investimento')}</p>
        <p class="prop-valor__n">${escapar(inv?.valor || '')}</p>
        ${talvez(inv?.nota, () => `<p class="body prop-valor__nota">${escapar(inv.nota)}</p>`)}
      </div>`)}

      ${talvez(pag, () => `
      <div class="prop-pagamento reveal">
        ${talvez(pag?.chamada, () => `<p class="h3 prop-pagamento__chamada">${escapar(pag.chamada)}</p>`)}
        ${talvez(pag?.forma, () => `
        <div class="prop-campo">
          <p class="eyebrow">Forma de pagamento</p>
          <p class="body">${escapar(pag.forma)}</p>
          ${talvez(pag?.etapas, () => `<p class="small prop-nota">${escapar(pag.etapas)}</p>`)}
        </div>`)}
        ${talvez(Array.isArray(pag?.conta) && pag.conta.length, () => `
        <div class="prop-campo">
          <p class="eyebrow">Dados para pagamento</p>
          <dl class="prop-conta">
            ${(pag?.conta || []).map(([r, v]) => `<div><dt>${escapar(r)}</dt><dd>${escapar(v)}</dd></div>`).join('')}
          </dl>
        </div>`)}
      </div>`)}

    </div>
  </section>`;
}

function secCondicoes(itens) {
  if (!Array.isArray(itens) || !itens.length) return '';
  return `
  <section class="section section--tight prop-condicoes">
    <div class="wrap">
      <p class="eyebrow reveal">Condições</p>
      <div class="prop-cards">
        ${itens.map((c, i) => `
        <article class="prop-card reveal" style="--delay:${(i * 0.06).toFixed(2)}s">
          <span class="prop-card__tick" aria-hidden="true"></span>
          <h3 class="h3 prop-card__titulo">${escapar(c.titulo || '')}</h3>
          ${linhas(c.texto).map((l) => `<p class="body">${escapar(l)}</p>`).join('')}
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

function secSobre(sobre, assinatura) {
  if (!sobre && !assinatura) return '';
  return `
  <section class="section prop-sobre" id="sobre">
    <div class="wrap prop-sobre__grade">
      <div class="prop-sobre__txt reveal">
        <p class="eyebrow">Quem assina</p>
        ${linhas(sobre?.texto).map((l) => `<p class="lead prop-sobre__p">${escapar(l)}</p>`).join('')}
      </div>
      <div class="prop-sobre__lado reveal">
        ${talvez(sobre?.foto, () => `<figure class="prop-retrato"><img src="${escapar(sobre.foto)}" alt="" loading="lazy"></figure>`)}
        ${talvez(assinatura, () => `
        <div class="prop-assina">
          <span class="rule" aria-hidden="true"></span>
          <p class="small prop-assina__papel">${escapar(assinatura?.papel || 'Responsável pelo projeto')}</p>
          <p class="prop-assina__nome">${escapar(assinatura?.nome || '')}<em>${escapar(assinatura?.sobrenome || '')}</em></p>
        </div>`)}
      </div>
    </div>
  </section>`;
}

export function renderizarProposta(p) {
  const cliente = escapar(p.cliente || '');
  const titulo = escapar(p.titulo || 'Proposta');
  const ano = new Date().getFullYear();

  return `<!doctype html>
<html lang="${escapar(p.idioma || 'pt-BR')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proposta · ${cliente} — Samuel Freire</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/base.css">
<link rel="stylesheet" href="/styles/proposta.css?v=${V}">
<link rel="icon" href="/img/favicon.png">
</head>
<body class="proposta">

<header class="prop-topo">
  <div class="wrap prop-topo__in">
    <a class="prop-topo__marca" href="/">Samuel<em>Freire</em></a>
    <p class="eyebrow prop-topo__tag">Proposta comercial</p>
  </div>
</header>

<main>

  <section class="section prop-capa">
    <div class="wrap">
      <p class="eyebrow reveal">Proposta · ${cliente}</p>
      <h1 class="display prop-capa__titulo reveal" style="--delay:.08s">${titulo}</h1>
      ${talvez(p.subtitulo, () => `<p class="lead prop-capa__sub reveal" style="--delay:.16s">${escapar(p.subtitulo)}</p>`)}
      <dl class="prop-capa__meta reveal" style="--delay:.24s">
        ${talvez(p.preparadaPara, () => `<div><dt class="eyebrow">Preparada para</dt><dd class="body">${escapar(p.preparadaPara)}</dd></div>`)}
        ${talvez(p.data, () => `<div><dt class="eyebrow">Data</dt><dd class="body">${escapar(p.data)}</dd></div>`)}
        ${talvez(p.validade, () => `<div><dt class="eyebrow">Validade</dt><dd class="body">${escapar(p.validade)}</dd></div>`)}
      </dl>
    </div>
  </section>

  ${secEscopo(p.escopo)}
  ${secInclui(p.inclui)}
  ${secInvestimento(p.investimento, p.pagamento)}
  ${secCondicoes(p.condicoes)}
  ${secSobre(p.sobre, p.assinatura)}

  ${talvez(p.encerramento, () => `
  <section class="section section--tight band-brand prop-fim">
    <div class="wrap">
      <p class="h2 prop-fim__frase">${escapar(p.encerramento)}</p>
      ${talvez(p.contato, () => `<a class="btn btn--ghost on-dark" href="${escapar(p.contato.link || '#')}">${escapar(p.contato.rotulo || 'Falar comigo')}</a>`)}
    </div>
  </section>`)}

</main>

<footer class="prop-rodape">
  <div class="wrap">
    <p class="small">Todos os direitos reservados © ${ano} · Samuel Freire Web Designer</p>
  </div>
</footer>

<script src="/js/main.js" defer></script>
</body>
</html>`;
}
