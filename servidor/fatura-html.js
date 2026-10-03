/* ============================================================
   Monta a página de uma fatura (ou invoice) a partir do JSON.

   Um documento só, com dois idiomas: "fatura" sai em português e
   em real, para cliente do Brasil; "invoice" sai em inglês, na
   moeda que o cliente paga. O desenho é o mesmo das propostas
   (Manrope, tinta, laranja de detalhe, hairline) e a folha tem o
   tamanho de um A4: na tela é a página que o cliente abre pelo
   link; na impressão vira o PDF, sem biblioteca nenhuma.

   A mesma função serve a página pública e a prévia do painel.
   ============================================================ */

import { metaCompartilhar } from './compartilhar.js';

const V = 'f1';   // versão do fatura.css, para o cache

// Escapa também as aspas: os valores entram em atributos.
const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linhas = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);
const talvez = (cond, montar) => (cond ? montar() : '');

/* ---------- idiomas ---------- */

const TEXTOS = {
  fatura: {
    lang: 'pt-BR', local: 'pt-BR',
    documento: 'Fatura', numero: 'Nº',
    emissao: 'Emissão', vencimento: 'Vencimento',
    de: 'Prestador', para: 'Cliente',
    docEmissor: 'CNPJ', docCliente: 'CPF/CNPJ',
    servico: 'Serviço', valor: 'Valor',
    total: 'Valor a pagar', totalPago: 'Valor pago',
    venceEm: 'Vence em', pagaEm: 'Paga em',
    aberta: 'Em aberto', vencida: 'Vencida', paga: 'Paga',
    pagamento: 'Dados para pagamento', copiar: 'Copiar', copiado: 'Copiado',
    imprimir: 'Imprimir ou salvar em PDF',
    dica: 'Na janela de impressão, escolha "Salvar como PDF".',
    assinatura: 'Web designer · marca e presença digital',
    emitidoPor: 'Documento emitido por',
  },
  invoice: {
    lang: 'en', local: 'en-US',
    documento: 'Invoice', numero: 'No.',
    emissao: 'Issue date', vencimento: 'Due date',
    de: 'From', para: 'Bill to',
    docEmissor: 'CNPJ (Brazil)', docCliente: 'Tax ID',
    servico: 'Service', valor: 'Amount',
    total: 'Amount due', totalPago: 'Amount paid',
    venceEm: 'Due on', pagaEm: 'Paid on',
    aberta: 'Open', vencida: 'Overdue', paga: 'Paid',
    pagamento: 'Payment details', copiar: 'Copy', copiado: 'Copied',
    imprimir: 'Print or save as PDF',
    dica: 'In the print window, choose "Save as PDF".',
    assinatura: 'Web designer · brand and digital presence',
    emitidoPor: 'Issued by',
  },
};

export const tipoDe = (f) => (f?.tipo === 'invoice' ? 'invoice' : 'fatura');
export const textosDe = (f) => TEXTOS[tipoDe(f)];

/* ---------- datas e dinheiro ---------- */

// Datas guardadas como "2026-09-24". Formatadas em UTC para o dia
// não voltar um por causa do fuso.
function data(iso, local) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString(local, { day: '2-digit', month: local === 'pt-BR' ? '2-digit' : 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dinheiro(valor, moeda, local) {
  const n = Number(valor) || 0;
  try {
    return new Intl.NumberFormat(local, { style: 'currency', currency: moeda || 'BRL' }).format(n);
  } catch (e) {
    return (moeda || '') + ' ' + n.toFixed(2);
  }
}

// "Hoje" no fuso do Brasil: às 22h em São Paulo o servidor (em UTC) já
// estaria no dia seguinte e marcaria como vencida uma fatura que vence hoje.
const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function situacao(f) {
  if (f?.paga) return 'paga';
  if (f?.vencimento && f.vencimento < hojeIso()) return 'vencida';
  return 'aberta';
}

/* ---------- partes ---------- */

const BAIXAR = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function parte(rotulo, pessoa = {}, docRotulo) {
  const contato = [pessoa.telefone, pessoa.email].filter(Boolean);
  return `
      <div class="fat-parte">
        <p class="fat-rot">${esc(rotulo)}</p>
        <p class="fat-parte__nome">${esc(pessoa.nome || '')}</p>
        ${talvez(pessoa.documento, () => `<p>${esc(docRotulo)} ${esc(pessoa.documento)}</p>`)}
        ${linhas(pessoa.endereco).map((l) => `<p>${esc(l)}</p>`).join('')}
        ${talvez(contato.length, () => `<p>${contato.map(esc).join(' · ')}</p>`)}
      </div>`;
}

export function renderizarFatura(f, { previa = false, imprimir = false } = {}) {
  const t = textosDe(f);
  const tipo = tipoDe(f);
  const moeda = f.moeda || (tipo === 'invoice' ? 'USD' : 'BRL');
  const valor = dinheiro(f.valor, moeda, t.local);
  const sit = situacao(f);
  const serv = f.servico || {};
  const cliente = f.cliente || {};
  const emissor = f.emissor || {};
  const pagamento = (Array.isArray(f.pagamento) ? f.pagamento : []).filter((p) => Array.isArray(p) && p[1]);
  const rotuloSit = sit === 'paga'
    ? t.paga + (f.pagaEm ? ' · ' + data(f.pagaEm, t.local) : '')
    : sit === 'vencida' ? t.vencida : t.aberta;
  // O título da aba vira o nome do PDF ao salvar.
  const tituloAba = [t.documento, f.codigo, cliente.nome].filter(Boolean).join(' ');

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloAba)}</title>
<meta name="robots" content="noindex, nofollow">
${metaCompartilhar({
  titulo: `${tituloAba} | Samuel Freire`,
  descricao: t.lang === 'en' ? 'Invoice from Samuel Freire Web Designer.' : 'Fatura de Samuel Freire Web Designer.',
  imagem: 'fatura',
  caminho: f.id ? `/faturas/${f.id}` : '/',
  alt: 'Fatura de Samuel Freire',
})}
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/base.css">
<link rel="stylesheet" href="/styles/fatura.css?v=${V}">
<link rel="icon" href="/img/favicon.png">
</head>
<body class="fatura${previa ? ' fatura--previa' : ''}">

${previa ? '' : `<div class="fat-barra">
  <p class="fat-barra__dica">${esc(t.dica)}</p>
  <button class="btn btn--brand fat-barra__btn" type="button" data-imprimir>${BAIXAR}${esc(t.imprimir)}</button>
</div>`}

<main class="fat-folha" data-situacao="${sit}">

  <header class="fat-topo">
    <div>
      <p class="fat-marca">Samuel<em>Freire</em></p>
      <p class="fat-assinatura">${esc(t.assinatura)}</p>
    </div>
    <div class="fat-titulo">
      <h1>${esc(t.documento)}</h1>
      ${talvez(f.codigo, () => `<p>${esc(t.numero)} ${esc(f.codigo)}</p>`)}
    </div>
  </header>

  <section class="fat-datas">
    <div><p class="fat-rot">${esc(t.emissao)}</p><p class="fat-dado">${esc(data(f.emissao, t.local))}</p></div>
    <div><p class="fat-rot">${esc(t.vencimento)}</p><p class="fat-dado">${esc(data(f.vencimento, t.local))}</p></div>
    <p class="fat-selo" data-situacao="${sit}">${esc(rotuloSit)}</p>
  </section>

  <section class="fat-partes">
    ${parte(t.de, emissor, t.docEmissor)}
    ${parte(t.para, cliente, t.docCliente)}
  </section>

  <section class="fat-servico">
    <div class="fat-servico__cab"><p class="fat-rot">${esc(t.servico)}</p><p class="fat-rot">${esc(t.valor)}</p></div>
    <div class="fat-servico__linha">
      <div>
        <p class="fat-servico__titulo">${esc(serv.titulo || '')}</p>
        ${linhas(serv.descricao).map((l) => `<p class="fat-servico__desc">${esc(l)}</p>`).join('')}
      </div>
      <p class="fat-servico__valor">${esc(valor)}</p>
    </div>
  </section>

  <section class="fat-total">
    <p class="fat-rot">${esc(sit === 'paga' ? t.totalPago : t.total)}</p>
    <p class="fat-total__valor">${esc(valor)}</p>
    ${talvez(sit !== 'paga' && f.vencimento, () => `<p class="fat-total__vence">${esc(t.venceEm)} ${esc(data(f.vencimento, t.local))}</p>`)}
  </section>

  ${talvez(pagamento.length, () => `
  <section class="fat-pagamento">
    <p class="fat-rot">${esc(t.pagamento)}</p>
    <dl>
      ${pagamento.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd><span>${esc(v)}</span><button class="fat-copiar" type="button" data-copiar="${esc(v)}" data-feito="${esc(t.copiado)}">${esc(t.copiar)}</button></dd></div>`).join('')}
    </dl>
  </section>`)}

  <footer class="fat-pe">
    <p>${esc(t.emitidoPor)} ${esc(emissor.nome || 'Samuel Freire')}${emissor.email ? ' · ' + esc(emissor.email) : ''}</p>
    <p>links.samuelfreire.com.br</p>
  </footer>

</main>

<script>
(function () {
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-imprimir]')) { window.print(); return; }
    var b = e.target.closest('[data-copiar]');
    if (!b || !navigator.clipboard) return;
    navigator.clipboard.writeText(b.getAttribute('data-copiar')).then(function () {
      var antes = b.textContent; b.textContent = b.getAttribute('data-feito');
      setTimeout(function () { b.textContent = antes; }, 1500);
    });
  });
  ${imprimir ? "(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 150); });" : ''}
})();
</script>
</body>
</html>`;
}
