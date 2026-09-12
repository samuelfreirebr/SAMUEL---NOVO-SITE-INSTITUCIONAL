/* ============================================================
   Monta a página de uma proposta a partir do JSON.

   A proposta não é um arquivo HTML solto: é um registro. Isso
   permite duplicar para outro cliente, corrigir um valor e
   republicar sem mexer em markup. É isso que o painel edita.

   O visual sai do mesmo tokens.css do site. Nenhuma cor ou
   medida crua aqui: se a marca mudar, a proposta acompanha.
   ============================================================ */

import { escapar } from './listas.js';

const V = 'p9';   // versão do proposta.css, para o cache

const linhas = (t) => String(t || '').split('\n').filter((l) => l.trim());

/* Um bloco só aparece se tiver conteúdo. Proposta sem seção de
   pagamento não deve renderizar um título órfão.

   O segundo argumento é uma função de propósito: passando o
   template pronto, ele seria montado antes desta chamada e um
   `pag.forma` com `pag` ausente derrubaria a página inteira, e o
   guarda não guardaria nada. Assim o HTML só é construído quando
   já se sabe que há o que construir. */
const talvez = (cond, montar) => (cond ? (typeof montar === 'function' ? montar() : montar) : '');

/* Ligar e desligar: p.visivel guarda só o que foi desligado
   ({ galeria: false }). Chave ausente vale ligada, então proposta
   antiga, sem o campo, sai inteira. Desligar não apaga o texto: ele
   fica guardado para quando ligar de novo. */
export const PARTES = [
  'ficha', 'escopo', 'inclui', 'incluiGrupos', 'processo', 'investimento', 'pagamento', 'conta',
  'condicoes', 'sobre', 'metricas', 'galeria', 'assinatura', 'ecossistema',
  'encerramento', 'botaoDuvidas', 'contatos', 'faq',
];
const ligada = (p, parte) => p?.visivel?.[parte] !== false;

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
          <span class="prop-item__ico" aria-hidden="true">${icone(iconePara(it, 'camadas'))}</span>
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

function secInclui(bloco, comGrupos = true) {
  if (!bloco) return '';
  const soltos = Array.isArray(bloco.itens) ? bloco.itens : [];
  const grupos = comGrupos && Array.isArray(bloco.grupos) ? bloco.grupos : [];
  if (!soltos.length && !grupos.length) return '';

  const linha = (t) => `<li class="prop-inclui__item">${icone('check', 'ico prop-inclui__tick')}<span>${escapar(t)}</span></li>`;
  // Lista longa vira duas colunas de linhas; curta fica numa, com ar.
  const dupla = soltos.length >= 8 ? ' prop-inclui__itens--dupla' : '';

  return `
  <section class="section band-invert on-dark prop-inclui">
    <div class="wrap prop-inclui__grade">
      <header class="prop-inclui__cab reveal">
        <p class="eyebrow">${escapar(bloco.rotulo || 'O que inclui')}</p>
        <h2 class="h2 prop-inclui__titulo">${escapar(bloco.titulo || 'Cada entregável inclui')}</h2>
        ${talvez(bloco.texto, () => `<p class="lead prop-inclui__texto">${escapar(bloco.texto)}</p>`)}
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
   parcela, que é o que o painel grava) ou como texto solto
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

function secInvestimento(inv, pag, comConta = true) {
  if (!inv && !pag) return '';
  if (pag && !comConta) pag = { ...pag, conta: [] };
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
          <span class="prop-card__ico" aria-hidden="true">${icone(iconePara(c, ['escudo', 'relogio', 'check', 'documento'][i] || 'check'))}</span>
          <h3 class="h3 prop-card__titulo">${escapar(c.titulo || '')}</h3>
          <div class="prop-card__corpo">
            ${linhas(c.texto).map((l) => `<p class="body">${escapar(l)}</p>`).join('')}
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

function secSobre(sobre, assinatura, partes = {}) {
  if (!sobre && !assinatura) return '';
  const { metricas: comMetricas = true, galeria: comGaleria = true, assinatura: comAssinatura = true } = partes;
  if (!comAssinatura) assinatura = { ...assinatura, papel: '' };
  const metricas = comMetricas && Array.isArray(sobre?.metricas) ? sobre.metricas.filter((m) => m && (m.n || m.rotulo)) : [];
  const galeria = comGaleria && Array.isArray(sobre?.galeria) ? sobre.galeria.filter(Boolean) : [];
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
            <span class="prop-metrica__rot">${linhas(m.rotulo).map(escapar).join(' <br>')}</span>
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
          <p class="prop-frente__topo"><span class="prop-frente__ico" aria-hidden="true">${icone(iconePara(f, ['pena', 'globo', 'megafone', 'cpu'][i] || 'camadas'))}</span><span class="eyebrow">${escapar(f.titulo || '')}</span><span class="prop-frente__num">${String(i + 1).padStart(2, '0')}</span></p>
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
   aceso: a página nunca depende do efeito. */
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
            <span class="prop-etapa__ico" aria-hidden="true">${icone(iconePara(e, ['lupa', 'alvo', 'roteiro', 'codigo', 'check', 'caixa'][i] || 'check'))}</span>
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

/* ---------- ícones ----------
   Traço de 1.6 em caixa de 24, cantos redondos: o mesmo desenho da
   seta. Nada de preenchimento: só linha, como o resto do sistema.
   Cada seção escolhe pelo campo "icone" do item; sem ele, adivinha
   pela palavra-chave do título; sem palavra, usa o padrão da posição. */
const ICONES = {
  lupa: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  roteiro: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/>',
  codigo: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  caixa: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ferramenta: '<path d="M14.5 4.5a4.5 4.5 0 0 0-5.7 5.7L3 16v5h5l5.8-5.8a4.5 4.5 0 0 0 5.7-5.7l-3 3-2.5-.5-.5-2.5z"/>',
  documento: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6"/>',
  pena: '<path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  megafone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  moeda: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 1.5 1.5 2 3 2.4s3 .9 3 2.4c0 1.3-1.3 2.3-3 2.3s-3-1.1-3-2.5"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  camadas: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>',
  impressora: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  aperto: '<path d="M11 17l-1 1a2 2 0 0 1-3-3l1-1M8 11l3 3M14 8l-3 3a2 2 0 0 0 3 3l3-3M20 12l-4-4-3 1-3-2-6 6M4 12l4 4"/>',
  behance: '<path d="BEHANCE_PATH" fill="currentColor" stroke="none"/>',
};
ICONES.behance = ICONES.behance.replace('BEHANCE_PATH', 'M7.443 5.35c.639 0 1.23.05 1.77.198.54.099 1.001.297 1.387.545.385.297.685.644.884 1.09.197.446.296.99.296 1.634 0 .743-.167 1.362-.506 1.858-.334.495-.836.9-1.487 1.214.9.256 1.572.71 2.011 1.354.442.644.66 1.42.66 2.326 0 .74-.14 1.38-.42 1.92-.28.545-.664.99-1.15 1.335-.48.35-1.04.6-1.67.762-.62.16-1.26.24-1.92.24H0V5.35zm-.354 5.56c.525 0 .96-.125 1.301-.376.34-.25.506-.66.506-1.222 0-.31-.056-.57-.17-.77a1.2 1.2 0 0 0-.45-.463 1.9 1.9 0 0 0-.649-.226 4 4 0 0 0-.764-.06H3.18v3.117zm.173 5.845c.33 0 .64-.03.93-.096.29-.06.55-.17.77-.32.22-.15.4-.35.53-.61.13-.26.19-.59.19-.98 0-.77-.22-1.32-.65-1.65-.43-.33-1-.49-1.71-.49H3.18v4.146zM16.94 16.9c.43.42 1.05.63 1.86.63.58 0 1.08-.15 1.5-.44.42-.29.68-.6.78-.92h2.61c-.42 1.3-1.06 2.22-1.92 2.78-.86.56-1.9.84-3.12.84-.85 0-1.62-.14-2.3-.41a4.8 4.8 0 0 1-1.74-1.16 5.2 5.2 0 0 1-1.1-1.8 6.6 6.6 0 0 1-.39-2.3c0-.82.13-1.58.4-2.28a5.3 5.3 0 0 1 1.13-1.81 5.2 5.2 0 0 1 1.75-1.2 5.6 5.6 0 0 1 2.25-.44c.92 0 1.72.18 2.41.54.69.36 1.25.84 1.69 1.44.44.6.75 1.29.94 2.06.19.77.26 1.58.21 2.42h-7.81c0 .84.28 1.63.71 2.05Zm3.28-5.56c-.34-.38-.93-.58-1.66-.58-.48 0-.88.08-1.19.25-.32.16-.57.36-.76.6-.19.24-.32.5-.4.77-.7.27-.11.51-.13.72h4.75c-.14-.75-.28-1.38-.61-1.76M15.1 6.44h6.06v1.47H15.1z');

function icone(nome, classe = 'ico') {
  const d = ICONES[nome];
  if (!d) return '';
  return `<svg class="${classe}" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

// palavra-chave no título → ícone
const PISTAS = [
  [/garantia|seguran/i, 'escudo'], [/prazo|dias|tempo|cronograma/i, 'relogio'],
  [/contrato|nota|fiscal|document/i, 'documento'], [/ferramenta|plugin|hospedagem|servidor/i, 'ferramenta'],
  [/clareza|confian|transparên|etapa/i, 'check'], [/pagamento|parcela|valor|invest/i, 'moeda'],
  [/marca|brand|identidade|logo/i, 'pena'], [/digital|site|web|landing|página/i, 'globo'],
  [/marketing|social|campanha|anúncio/i, 'megafone'], [/sistema|ferramentas|automa|ia\b|tool/i, 'cpu'],
  [/impress|cartão|flyer|adesivo|folder/i, 'impressora'], [/descoberta|diagn|pesquisa|entend/i, 'lupa'],
  [/estratégia|posicionamento|objetivo/i, 'alvo'], [/roteiro|roadmap|plano|planej/i, 'roteiro'],
  [/implementa|desenvolv|constru|produção/i, 'codigo'], [/teste|revis|ajuste|qualidade/i, 'check'],
  [/entrega|lançamento|publica/i, 'caixa'], [/suporte|acompanha/i, 'aperto'],
];
function iconePara(item, padrao) {
  if (item?.icone && ICONES[item.icone]) return item.icone;
  const t = String(item?.titulo || item?.marca || '');
  for (const [re, nome] of PISTAS) if (re.test(t)) return nome;
  return padrao;
}

/* O seletor de ícones do painel mostra o desenho, não o nome. As
   pistas vão junto para o painel dizer qual seria o automático. */
const NOMES_ICONES = {
  lupa: 'Lupa', alvo: 'Alvo', roteiro: 'Lista', codigo: 'Código', check: 'Check', caixa: 'Caixa',
  escudo: 'Escudo', relogio: 'Relógio', ferramenta: 'Ferramenta', documento: 'Documento', pena: 'Pena',
  globo: 'Globo', megafone: 'Megafone', cpu: 'Chip', mail: 'E-mail', chat: 'Conversa',
  calendario: 'Calendário', moeda: 'Moeda', raio: 'Raio', camadas: 'Camadas', impressora: 'Impressora',
  aperto: 'Aperto de mão',
};
export function catalogoIcones() {
  return {
    icones: Object.entries(NOMES_ICONES).map(([nome, rotulo]) => ({ nome, rotulo, svg: icone(nome) })),
    pistas: PISTAS.map(([re, nome]) => [re.source, re.flags, nome]),
  };
}

const SETA = '<svg class="arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 12L12 4M12 4H5.5M12 4v6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// "+55 83 98207-8301" → link do WhatsApp; um link já pronto passa direto
const linkZap = (v) => /^https?:/.test(v || '') ? v : 'https://wa.me/' + String(v || '').replace(/\D/g, '');
const linkSite = (v) => /^https?:/.test(v || '') ? v : 'https://' + String(v || '').replace(/^\/+/, '');

/* O link do WhatsApp já vai com a mensagem escrita: quem clica em
   "Confirmar orçamento" abre a conversa com a proposta identificada,
   sem precisar explicar de onde veio. Link que não é WhatsApp, ou
   que já traz texto, passa como está. */
function comMensagem(link, texto) {
  if (!link || !/wa\.me|whatsapp/.test(link) || /[?&]text=/.test(link) || !texto) return link;
  return link + (link.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(texto);
}

/* "Quero confirmar o orçamento da proposta." vira "... da proposta:
   Hunter Interior Design." O cliente entra no fim da frase. */
function comCliente(msg, cliente) {
  const base = String(msg || '').trim();
  if (!cliente) return base;
  return base.replace(/[.!?\s]+$/, '') + ': ' + cliente + '.';
}

const itensFaq = (faq) => (Array.isArray(faq?.itens) ? faq.itens : []).filter((f) => f && f.pergunta);

/* Fechamento: a frase grande, o apoio, os dois botões (confirmar e
   tirar dúvidas) e, ao lado, os contatos, para quem lê no celular
   ter o número na mão sem depender do botão. */
function secFim(p) {
  const c = p.contato || {};
  if (!p.encerramento && !c.link && !c.whatsapp) return '';
  const zap = c.whatsapp || (c.link && /wa\.me|whatsapp/.test(c.link) ? c.link : '');
  const base = c.link || (zap && linkZap(zap)) || (c.email && 'mailto:' + c.email) || '#';
  const principal = comMensagem(base, comCliente(c.mensagem || 'Oi, Samuel! Quero confirmar o orçamento da proposta.', p.cliente));
  const temFaq = ligada(p, 'faq') && ligada(p, 'botaoDuvidas') && itensFaq(p.faq).length > 0;
  const contatos = !ligada(p, 'contatos') ? [] : [
    zap && ['WhatsApp', c.whatsapp || 'abrir conversa', linkZap(zap), 'chat'],
    c.email && ['E-mail', c.email, 'mailto:' + c.email, 'mail'],
    c.portfolio && ['Portfólio', c.portfolio.replace(/^https?:\/\//, ''), linkSite(c.portfolio), /behance/i.test(c.portfolio) ? 'behance' : 'globo'],
    c.site && ['Site', c.site.replace(/^https?:\/\//, ''), linkSite(c.site), 'globo'],
  ].filter(Boolean);

  return `
  <section class="section band-brand on-dark prop-fim" id="contato">
    <div class="wrap prop-fim__grade">
      <div class="prop-fim__txt reveal">
        <p class="eyebrow">${escapar(c.rotuloSecao || 'Próximo passo')}</p>
        <p class="h1 prop-fim__frase">${escapar(p.encerramento || 'Vamos conversar?')}</p>
        ${talvez(c.texto, () => `<p class="lead prop-fim__apoio">${escapar(c.texto)}</p>`)}
        <div class="prop-fim__acoes">
          <a class="btn prop-fim__btn" href="${escapar(principal)}" target="_blank" rel="noopener">${escapar(c.rotulo || 'Confirmar orçamento')}${SETA}</a>
          ${temFaq
            ? `<a class="btn btn--ghost prop-fim__duvidas" href="#duvidas" data-duvidas aria-controls="duvidas" aria-expanded="false">${escapar(c.rotuloDuvidas || 'Tenho dúvidas')}</a>`
            : talvez(c.email && principal !== 'mailto:' + c.email, () => `<a class="btn btn--ghost" href="mailto:${escapar(c.email)}">Enviar e-mail</a>`)}
        </div>
      </div>
      ${talvez(contatos.length, () => `
      <dl class="prop-fim__dados reveal" style="--delay:.08s">
        ${contatos.map(([r, v, h, ic]) => `<div><dt>${icone(ic)}${escapar(r)}</dt><dd><a href="${escapar(h)}" target="_blank" rel="noopener">${escapar(v)}</a></dd></div>`).join('')}
        ${talvez(p.cliente, () => `<div><dt>${icone('documento')}Esta proposta</dt><dd>${escapar(p.cliente)}${p.validade ? ' · válida por ' + escapar(p.validade) : ''}</dd></div>`)}
      </dl>`)}
    </div>
  </section>`;
}

/* Perguntas frequentes: fica escondida até o cliente clicar em
   "Tenho dúvidas" (classe .aberto pelo proposta.js, ou :target sem
   JS). Sem .reveal aqui de propósito: o main.js mede as posições no
   carregamento, e um bloco que nasce invisível mediria zero. */
function secFaq(p) {
  const faq = p.faq || {};
  const itens = itensFaq(faq);
  if (!itens.length) return '';
  const c = p.contato || {};
  const zap = c.whatsapp || (c.link && /wa\.me|whatsapp/.test(c.link) ? c.link : '');
  const link = zap ? comMensagem(linkZap(zap), comCliente('Oi, Samuel! Tenho uma dúvida sobre a proposta.', p.cliente)) : (c.email ? 'mailto:' + c.email : '');
  return `
  <section class="section prop-faq${ligada(p, 'botaoDuvidas') && ligada(p, 'encerramento') ? '' : ' aberto'}" id="duvidas">
    <div class="wrap prop-faq__grade">
      <header class="prop-faq__cab">
        <p class="eyebrow">${escapar(faq.rotulo || 'Perguntas frequentes')}</p>
        <h2 class="h2 prop-faq__titulo">${escapar(faq.titulo || 'O que costumam me perguntar')}</h2>
        ${talvez(faq.texto, () => `<p class="body prop-faq__texto">${escapar(faq.texto)}</p>`)}
      </header>
      <div class="prop-faq__lista">
        ${itens.map((f, i) => `
        <details class="prop-faq__item" name="faq">
          <summary class="prop-faq__q">
            <span class="prop-faq__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
            <span class="prop-faq__pergunta">${escapar(f.pergunta)}</span>
            <span class="prop-faq__mais" aria-hidden="true"></span>
          </summary>
          <div class="prop-faq__r">${linhas(f.resposta).map((l) => `<p class="body">${escapar(l)}</p>`).join('')}</div>
        </details>`).join('')}
        ${talvez(link, () => `<p class="prop-faq__pe">${escapar(faq.rodape || 'Ficou alguma dúvida que não está aqui?')} <a href="${escapar(link)}" target="_blank" rel="noopener">${escapar(faq.rodapeLink || 'Me chama no WhatsApp')}${SETA}</a></p>`)}
      </div>
    </div>
  </section>`;
}

function rodape(p, ano) {
  return `<footer class="prop-rodape">
  <div class="wrap prop-rodape__grade">
    <div>
      <p class="prop-rodape__marca">Samuel<em>Freire</em></p>
      <p class="small prop-rodape__desc">Web designer · lançamentos, marca e presença digital</p>
    </div>
    <p class="small prop-rodape__legal">© ${ano} Samuel Freire Web Designer · Proposta confidencial, preparada para ${escapar(p.cliente || 'você')}.</p>
  </div>
</footer>`;
}

/* ---------- capa ----------
   A ficha: quem recebe (monograma com as iniciais, no lugar de um
   ícone genérico), quem faz, a data e a validade. No desktop fica ao
   lado do título, como um cartão; no celular vem abaixo. */
function iniciais(nome) {
  const partes = String(nome || '').replace(/[&|·,]/g, ' ').split(/\s+/)
    .filter((x) => x && !/^(de|da|do|dos|das|e|and|of|the|for|para)$/i.test(x));
  return partes.slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '•';
}

function dataDaProposta(p) {
  if (p.data) return String(p.data);
  const d = new Date(p.criadaEm || p.atualizadaEm || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(String(p.idioma || '').startsWith('en') ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fichaCapa(p) {
  const para = p.preparadaPara || p.cliente || '';
  const a = p.assinatura || {};
  const por = ((a.nome || 'Samuel') + ' ' + (a.sobrenome || (a.nome ? '' : 'Freire'))).trim();
  const data = dataDaProposta(p);
  return `
      <aside class="prop-capa__ficha reveal" style="--delay:.24s" aria-label="Ficha da proposta">
        <div class="prop-capa__para">
          <span class="prop-capa__mono" aria-hidden="true">${escapar(iniciais(para))}</span>
          <div class="prop-capa__dado">
            <span class="prop-capa__rot">Preparada para</span>
            <b>${escapar(para)}</b>
            ${talvez(p.cliente && !para.toLowerCase().includes(String(p.cliente).toLowerCase()), () => `<span class="prop-capa__apoio">${escapar(p.cliente)}</span>`)}
          </div>
        </div>
        <div class="prop-capa__dado">
          <span class="prop-capa__rot">Feita por</span>
          <b>${escapar(por)}</b>
          ${talvez(a.papel, () => `<span class="prop-capa__apoio">${escapar(a.papel)}</span>`)}
        </div>
        <div class="prop-capa__par">
          ${talvez(data, () => `<div class="prop-capa__dado"><span class="prop-capa__rot">Data</span><b>${escapar(data)}</b></div>`)}
          ${talvez(p.validade, () => `<div class="prop-capa__dado"><span class="prop-capa__rot">Validade</span><b>${escapar(p.validade)}</b></div>`)}
        </div>
      </aside>`;
}

/* Prévia do painel: a mesma página, sem o main.js. Sem ele não há
   revelação, Lenis nem processo preso na rolagem: tudo nasce visível
   e parado, que é o que se quer enquanto se edita. */
export function renderizarProposta(p, { previa = false } = {}) {
  const cliente = escapar(p.cliente || '');
  const titulo = escapar(p.titulo || 'Proposta');
  const ano = new Date().getFullYear();

  return `<!doctype html>
<html lang="${escapar(p.idioma || 'pt-BR')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proposta · ${cliente} | Samuel Freire</title>
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
    <div class="wrap prop-capa__grade">
      <div class="prop-capa__txt">
        <p class="eyebrow reveal">Proposta · ${cliente}</p>
        <h1 class="display prop-capa__titulo reveal" style="--delay:.08s">${titulo}</h1>
        ${talvez(p.subtitulo, () => `<p class="lead prop-capa__sub reveal" style="--delay:.16s">${escapar(p.subtitulo)}</p>`)}
      </div>
      ${talvez(ligada(p, 'ficha'), () => fichaCapa(p))}
    </div>
  </section>

  ${talvez(ligada(p, 'escopo'), () => secEscopo(p.escopo))}
  ${talvez(ligada(p, 'inclui'), () => secInclui(p.inclui, ligada(p, 'incluiGrupos')))}
  ${talvez(ligada(p, 'processo'), () => secProcesso(p.processo))}
  ${secInvestimento(ligada(p, 'investimento') ? p.investimento : null, ligada(p, 'pagamento') ? p.pagamento : null, ligada(p, 'conta'))}
  ${talvez(ligada(p, 'condicoes'), () => secCondicoes(p.condicoes))}
  ${talvez(ligada(p, 'sobre'), () => secSobre(p.sobre, p.assinatura, { metricas: ligada(p, 'metricas'), galeria: ligada(p, 'galeria'), assinatura: ligada(p, 'assinatura') }))}
  ${talvez(ligada(p, 'ecossistema'), () => secEcossistema(p.ecossistema))}

  ${talvez(ligada(p, 'encerramento'), () => secFim(p))}
  ${talvez(ligada(p, 'faq'), () => secFaq(p))}

</main>

${rodape(p, ano)}

${previa ? '' : '<script src="/js/main.js" defer></script>'}
<script src="/js/proposta.js?v=${V}" defer></script>
</body>
</html>`;
}
