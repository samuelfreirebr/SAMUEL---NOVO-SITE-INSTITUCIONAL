/* ============================================================
   Monta a página de uma proposta a partir do JSON.

   A proposta não é um arquivo HTML solto: é um registro. Isso
   permite duplicar para outro cliente, corrigir um valor e
   republicar sem mexer em markup — e é o que o painel edita.

   O visual sai do mesmo tokens.css do site. Nenhuma cor ou
   medida crua aqui: se a marca mudar, a proposta acompanha.
   ============================================================ */

import { escapar } from './listas.js';

const V = 'p3';   // versão do proposta.css, para o cache

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

  const total = soltos.length + grupos.reduce((n, g) => n + (g.itens || []).length, 0);
  const linha = (t) => `<li class="prop-inclui__item"><span class="prop-inclui__tick" aria-hidden="true"></span><span>${escapar(t)}</span></li>`;
  // Lista longa vira duas colunas de linhas; curta fica numa, com ar.
  const dupla = soltos.length >= 8 ? ' prop-inclui__itens--dupla' : '';

  return `
  <section class="section band-invert on-dark prop-inclui">
    <div class="wrap prop-inclui__grade">
      <header class="prop-inclui__cab reveal">
        <p class="eyebrow">${escapar(bloco.rotulo || 'O que inclui')}</p>
        <h2 class="h2 prop-inclui__titulo">${escapar(bloco.titulo || 'Cada entregável inclui')}</h2>
        ${talvez(bloco.texto, () => `<p class="lead prop-inclui__texto">${escapar(bloco.texto)}</p>`)}
        <p class="prop-inclui__n"><b>${String(total).padStart(2, '0')}</b>${total === 1 ? 'item' : 'itens'} em cada entrega</p>
      </header>
      <div class="prop-inclui__lista reveal" style="--delay:.08s">
        ${talvez(soltos.length, () => `<ul class="prop-inclui__itens${dupla}">${soltos.map(linha).join('')}</ul>`)}
        ${grupos.map((g) => `
        <div class="prop-inclui__grupo">
          <p class="prop-inclui__grupo-titulo">${escapar(g.titulo || '')}</p>
          <ul class="prop-inclui__itens">${(g.itens || []).map(linha).join('')}</ul>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

/* O investimento pode vir estruturado (moeda, parcelas, valor da
   parcela — é o que o painel novo grava) ou como texto solto
   ("2× $750", das propostas antigas). Os dois renderizam igual. */
export function textoInvestimento(inv) {
  if (!inv) return { grande: '', apoio: '' };
  const parcelas = Math.max(1, Math.round(Number(inv.parcelas) || 1));
  const valor = Number(inv.valorParcela);
  if (!(valor > 0)) {
    // Texto antigo ("2× $750"): se tiver o formato "N x VALOR", ganha o
    // mesmo x de letra das propostas novas; senão sai como está.
    const bruto = String(inv.valor || '').trim();
    const m = /^(\d+)\s*[x×]\s*(.+)$/i.exec(bruto);
    if (m) return { grande: `${m[1]}x ${m[2]}`, apoio: '', partes: { parcelas: Number(m[1]), valor: m[2] } };
    return { grande: bruto, apoio: '' };
  }

  const moeda = inv.moeda || 'R$';
  const fmt = new Intl.NumberFormat(moeda === 'R$' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 2 });
  const dinheiro = (n) => `${moeda}${moeda.length > 1 ? ' ' : ''}${fmt.format(n)}`;
  if (parcelas === 1) return { grande: dinheiro(valor), apoio: 'à vista', partes: { valor: dinheiro(valor) } };
  // "2x", com x de letra: o sinal de multiplicação (×) sai pesado no
  // corpo de display. As partes vão separadas para o x ser estilizado.
  return {
    grande: `${parcelas}x ${dinheiro(valor)}`,
    apoio: `total ${dinheiro(parcelas * valor)}`,
    partes: { parcelas, valor: dinheiro(valor), total: dinheiro(parcelas * valor) },
  };
}

function secInvestimento(inv, pag) {
  if (!inv && !pag) return '';
  const { grande, apoio, partes } = textoInvestimento(inv);
  const valorHtml = partes?.parcelas
    ? `${partes.parcelas}<em class="prop-valor__x">x</em> ${escapar(partes.valor)}`
    : escapar(grande);
  const apoioHtml = partes?.total
    ? `total <b>${escapar(partes.total)}</b>`
    : escapar(apoio);
  return `
  <section class="section prop-investimento" id="investimento">
    <div class="wrap prop-investimento__grade">

      ${talvez(inv, () => `
      <div class="prop-valor reveal">
        <span class="rule rule--strong" aria-hidden="true"></span>
        <p class="eyebrow">${escapar(inv?.rotulo || 'Investimento')}</p>
        <p class="prop-valor__n">${valorHtml}</p>
        ${talvez(apoio, () => `<p class="prop-valor__apoio">${apoioHtml}</p>`)}
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
            ${(pag?.conta || []).map(([r, v]) => `<div>
              <dt>${escapar(r)}</dt>
              <dd><span class="prop-conta__valor">${escapar(v)}</span>
                <button class="prop-copiar" type="button" data-copiar="${escapar(v)}" aria-label="Copiar ${escapar(r)}">
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 5.5V3.7A1.2 1.2 0 0 0 9.3 2.5H3.7A1.2 1.2 0 0 0 2.5 3.7v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
                  <span>Copiar</span>
                </button>
              </dd>
            </div>`).join('')}
          </dl>
          <button class="mini-copiar prop-copiar prop-copiar--tudo" type="button" data-copiar-tudo>
            <span>Copiar todos os dados</span>
          </button>
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
          <span class="prop-card__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <span class="prop-card__tick" aria-hidden="true"></span>
          <h3 class="h3 prop-card__titulo">${escapar(c.titulo || '')}</h3>
          <div class="prop-card__corpo">
            ${linhas(c.texto).map((l) => `<p class="body">${escapar(l)}</p>`).join('')}
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

function secSobre(sobre, assinatura) {
  if (!sobre && !assinatura) return '';
  const metricas = Array.isArray(sobre?.metricas) ? sobre.metricas.filter((m) => m && (m.n || m.rotulo)) : [];
  const galeria = Array.isArray(sobre?.galeria) ? sobre.galeria.filter(Boolean) : [];
  // Seis fotos: a 2ª e a 3ª empilham numa coluna, como no PDF. Outra
  // quantidade: todas altas, em fileira.
  const baixa = (i) => galeria.length === 6 && (i === 1 || i === 2);

  return `
  <section class="section prop-sobre" id="sobre">
    <div class="wrap prop-sobre__grade">
      <figure class="prop-sobre__retrato reveal">
        ${talvez(sobre?.foto, () => `<img src="${escapar(sobre.foto)}" alt="" loading="lazy">`)}
      </figure>
      <div class="prop-sobre__txt reveal" style="--delay:.08s">
        <div class="prop-sobre__cab">
          <p class="eyebrow">${escapar(sobre?.rotulo || 'Sobre mim')}</p>
          <h2 class="h2 prop-sobre__nome">${escapar(sobre?.nome || ((assinatura?.nome || '') + ' ' + (assinatura?.sobrenome || '')).trim())}</h2>
          ${talvez(sobre?.cargo, () => `<p class="prop-sobre__cargo">${escapar(sobre.cargo)}</p>`)}
        </div>
        <div class="prop-sobre__corpo">
          ${linhas(sobre?.texto).map((l) => `<p class="body prop-sobre__p">${escapar(l)}</p>`).join('')}
          ${talvez(assinatura?.papel, () => `
          <p class="prop-assina">
            <span class="small prop-assina__papel">${escapar(assinatura.papel)}</span>
            <span class="prop-assina__nome">${escapar(assinatura.nome || '')}<em>${escapar(assinatura.sobrenome || '')}</em></span>
          </p>`)}
        </div>
      </div>
    </div>

    ${talvez(metricas.length || galeria.length, () => `
    <div class="wrap prop-sobre__mais">
      ${talvez(metricas.length, () => `
      <ul class="prop-metricas reveal">
        ${metricas.map((m, i) => `
        <li class="prop-metrica${m.destaque ? ' prop-metrica--destaque' : ''}" style="--delay:${(i * 0.06).toFixed(2)}s">
          <span class="rule rule--strong" aria-hidden="true"></span>
          <div class="prop-metrica__in">
            <b class="prop-metrica__n${/^[\d+.,%]+$/.test(m.n || '') ? '' : ' prop-metrica__n--texto'}">${escapar(m.n || '')}</b>
            <span class="prop-metrica__rot">${linhas(m.rotulo).map(escapar).join('<br>')}</span>
          </div>
        </li>`).join('')}
      </ul>`)}
      ${talvez(galeria.length, () => `
      <ul class="prop-galeria reveal" data-n="${galeria.length}" style="--delay:.1s">
        ${galeria.map((src, i) => `<li class="prop-galeria__item${baixa(i) ? ' prop-galeria__item--baixa' : ''}"><img src="${escapar(src)}" alt="" loading="lazy"></li>`).join('')}
      </ul>`)}
    </div>`)}
  </section>`;
}

function secEcossistema(eco) {
  const frentes = Array.isArray(eco?.frentes) ? eco.frentes.filter((f) => f && (f.titulo || (f.itens || []).length)) : [];
  if (!frentes.length) return '';
  const n = String(frentes.length).padStart(2, '0');
  return `
  <section class="section prop-eco" id="ecossistema">
    <div class="wrap">
      <header class="prop-eco__cab reveal">
        <p class="eyebrow">${escapar(eco.rotulo || 'Nosso ecossistema')}</p>
        ${talvez(eco.texto, () => `<p class="body prop-eco__texto">${escapar(eco.texto)}</p>`)}
      </header>
      <div class="prop-eco__grade" data-n="${frentes.length}">
        ${frentes.map((f, i) => `
        <article class="prop-frente${f.escuro ? ' prop-frente--escura on-dark' : ''} reveal" style="--delay:${(i * 0.06).toFixed(2)}s">
          <p class="prop-frente__topo"><span class="eyebrow">${escapar(f.titulo || '')}</span><span class="prop-frente__num">${String(i + 1).padStart(2, '0')}</span></p>
          <ul class="prop-frente__itens">${(f.itens || []).map((it) => `<li>${escapar(it)}</li>`).join('')}</ul>
        </article>`).join('')}
        <div class="prop-eco__centro reveal" style="--delay:.12s" aria-hidden="true">
          <span class="prop-eco__anel prop-eco__anel--1"></span>
          <span class="prop-eco__anel prop-eco__anel--2"></span>
          <div class="prop-eco__disco">
            <span class="prop-eco__sup">${escapar(eco.centro?.sup || n + ' frentes')}</span>
            <span class="prop-eco__titulo">${escapar(eco.centro?.titulo || eco.rotulo || 'Nosso ecossistema')}</span>
            <span class="prop-eco__traco"></span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* Processo com rolagem: a seção é mais alta que a tela e o miolo fica
   preso; conforme se rola, o main.js escreve --p (0 → 1) em
   [data-progresso] e acende cada [data-etapa]. Sem JS, tudo aparece
   aceso — a página nunca depende do efeito. */
function secProcesso(proc) {
  const etapas = Array.isArray(proc?.etapas) ? proc.etapas.filter((e) => e && (e.titulo || e.texto)) : [];
  if (!etapas.length) return '';
  return `
  <section class="section prop-processo" id="processo" data-progresso data-etapas="${etapas.length}">
    <div class="prop-processo__preso">
      <div class="wrap">
        <header class="prop-processo__cab">
          <p class="eyebrow">${escapar(proc.rotulo || 'Como trabalhamos')}</p>
          <h2 class="h2 prop-processo__titulo">${escapar(proc.titulo || 'Nosso processo')}</h2>
          <span class="prop-processo__barra" aria-hidden="true"><span></span></span>
        </header>
        <ol class="prop-etapas">
          ${etapas.map((e, i) => `
          <li class="prop-etapa${i === etapas.length - 1 ? ' prop-etapa--fim' : ''}" data-etapa="${i}">
            <p class="prop-etapa__topo"><span class="prop-etapa__num">${String(i + 1).padStart(2, '0')}</span><span class="prop-etapa__nome">${escapar(e.titulo || '')}</span></p>
            <p class="body prop-etapa__texto">${escapar(e.texto || '')}</p>
            ${talvez(e.nota, () => `<p class="small prop-etapa__nota">${escapar(e.nota)}</p>`)}
          </li>`).join('')}
        </ol>
        ${talvez(proc.rodape, () => `<p class="small prop-processo__pe">${escapar(proc.rodape)}</p>`)}
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
  ${secProcesso(p.processo)}
  ${secInvestimento(p.investimento, p.pagamento)}
  ${secCondicoes(p.condicoes)}
  ${secSobre(p.sobre, p.assinatura)}
  ${secEcossistema(p.ecossistema)}

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
<script src="/js/proposta.js?v=${V}" defer></script>
</body>
</html>`;
}
