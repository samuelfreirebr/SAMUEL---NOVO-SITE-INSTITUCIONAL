/* ============================================================
   Faturas e invoices.

   Três telas: a lista (o que está em aberto, vencido e pago), a
   escolha do tipo (fatura em português ou invoice em inglês) e o
   editor, com o formulário à esquerda e a folha A4 ao vivo à
   direita. A folha é montada pelo servidor, com o mesmo
   renderizador da página que o cliente abre pelo link.

   O PDF sai pela impressão do navegador: o botão abre a fatura
   com ?imprimir=1 e a janela de impressão aparece sozinha. Lá se
   escolhe "Salvar como PDF". Nenhuma biblioteca.
   ============================================================ */

import { ctx, h, texto, linha, bloco, chave, clonar } from '/admin/propostas/ui.js';

const $ = (s, r = document) => r.querySelector(s);

// As moedas do gerador da Agilize, na mesma ordem.
const MOEDAS = [
  ['USD', 'US$ · Dólar americano'], ['BRL', 'R$ · Real'], ['EUR', '€ · Euro'], ['GBP', '£ · Libra esterlina'],
  ['JPY', '¥ · Iene japonês'], ['CNY', '¥ · Yuan chinês'], ['CHF', 'CHF · Franco suíço'], ['CAD', 'C$ · Dólar canadense'],
  ['AUD', 'A$ · Dólar australiano'], ['NZD', 'NZ$ · Dólar neozelandês'], ['INR', '₹ · Rupia indiana'], ['KRW', '₩ · Won sul-coreano'],
  ['MXN', 'MX$ · Peso mexicano'], ['ARS', 'AR$ · Peso argentino'], ['CLP', 'CL$ · Peso chileno'], ['COP', 'CO$ · Peso colombiano'],
  ['PEN', 'S/ · Sol peruano'], ['UYU', 'UY$ · Peso uruguaio'], ['ZAR', 'R · Rand sul-africano'], ['RUB', '₽ · Rublo russo'],
  ['TRY', '₺ · Lira turca'], ['SEK', 'kr · Coroa sueca'], ['NOK', 'kr · Coroa norueguesa'], ['DKK', 'kr · Coroa dinamarquesa'],
  ['PLN', 'zł · Zloty polonês'], ['SGD', 'S$ · Dólar de Singapura'], ['HKD', 'HK$ · Dólar de Hong Kong'], ['THB', '฿ · Baht tailandês'],
  ['MYR', 'RM · Ringgit malaio'], ['IDR', 'Rp · Rupia indonésia'],
];

const TIPOS = {
  fatura: { nome: 'Fatura', prefixo: 'FAT', moeda: 'BRL', local: 'pt-BR', pagamento: [['Chave Pix', ''], ['Banco', ''], ['Agência e conta', '']] },
  invoice: { nome: 'Invoice', prefixo: 'INV', moeda: 'USD', local: 'en-US', pagamento: [['SWIFT', ''], ['IBAN', '']] },
};

// Só vale para a primeira fatura. Da segunda em diante, o prestador
// vem da última salva (o que você corrigir lá passa a valer).
const EMISSOR_PADRAO = { nome: 'Samuel Freire', documento: '', endereco: '', telefone: '+55 83 98207-8301', email: 'samuelfreirebr@gmail.com' };

/* ---------- estado ---------- */
const est = {
  lista: [],
  fatura: null,
  salva: '',
  modo: 'lista',          // 'lista' | 'tipo' | 'editor'
  previa: 'folha',        // 'folha' | 'celular'
};
const suja = () => est.modo === 'editor' && JSON.stringify(est.fatura) !== est.salva;
const tipoDe = (f) => (f?.tipo === 'invoice' ? 'invoice' : 'fatura');

/* ---------- utilidades ---------- */
// Data local (não UTC): às 22h em São Paulo, o dia ainda é hoje.
const hojeIso = () => new Date().toLocaleDateString('sv-SE');
function somarDias(iso, n) {
  const d = new Date((iso || hojeIso()) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
}
const dataCurta = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '');
function dinheiro(valor, moeda, local = 'pt-BR') {
  try { return new Intl.NumberFormat(local, { style: 'currency', currency: moeda || 'BRL' }).format(Number(valor) || 0); }
  catch (e) { return (moeda || '') + ' ' + (Number(valor) || 0).toFixed(2); }
}
function situacao(f) {
  if (f.paga) return 'paga';
  if (f.vencimento && f.vencimento < hojeIso()) return 'vencida';
  return 'aberta';
}
const ROTULO_SITUACAO = { paga: 'Paga', vencida: 'Vencida', aberta: 'Em aberto' };

function proximoCodigo(tipo) {
  const ano = hojeIso().slice(0, 4);
  const base = TIPOS[tipo].prefixo + '-' + ano + '-';
  const usados = est.lista.map((f) => String(f.codigo || '')).filter((c) => c.startsWith(base)).map((c) => Number(c.slice(base.length)) || 0);
  return base + String(Math.max(0, ...usados) + 1).padStart(3, '0');
}

/* ---------- API ---------- */
async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  const bruto = await r.text();
  if (r.status === 401) { location.replace('/admin/entrar?voltar=' + encodeURIComponent(location.pathname)); throw new Error('sessão encerrada'); }
  let dado;
  try { dado = JSON.parse(bruto); } catch (e) { throw new Error('o servidor respondeu algo que não é JSON.'); }
  if (!r.ok) throw new Error(dado.erro || ('erro ' + r.status));
  return dado;
}
const enviarJson = (url, metodo, corpo) => api(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

let tAviso;
function avisar(txt, tipo = 'ok') {
  const el = $('#aviso');
  el.textContent = txt; el.dataset.tipo = tipo; el.classList.add('mostra');
  clearTimeout(tAviso);
  if (tipo === 'ok') tAviso = setTimeout(() => el.classList.remove('mostra'), 3500);
}
async function copiarLink(id) {
  const link = location.origin + '/faturas/' + id;
  try { await navigator.clipboard.writeText(link); avisar('Link copiado.'); } catch (e) { avisar(link); }
}
const abrirPdf = (id) => window.open('/faturas/' + id + '?imprimir=1', '_blank', 'noopener');

/* ---------- topo ---------- */
function pintarTopo() {
  const acoes = $('#topo-acoes');
  acoes.innerHTML = '';
  const sec = $('#topo-sec');
  if (est.modo === 'lista') {
    sec.textContent = 'Faturas';
    acoes.append(h('button', { type: 'button', class: 'mini mini--ativo', onclick: escolherTipo }, '+ Novo documento'));
  } else if (est.modo === 'tipo') {
    sec.textContent = 'Novo documento';
    acoes.append(h('button', { type: 'button', class: 'mini', onclick: mostrarLista }, '← Faturas'));
  } else {
    const f = est.fatura;
    sec.textContent = TIPOS[tipoDe(f)].nome + (f.codigo ? ' ' + f.codigo : '');
    acoes.append(...[
      h('button', { type: 'button', class: 'mini', onclick: voltarParaLista }, '← Faturas'),
      h('span', { class: 'ed-estado', id: 'estado' }),
      f.id && h('button', { type: 'button', class: 'mini', onclick: () => copiarLink(f.id) }, 'Copiar link'),
      h('button', { type: 'button', class: 'mini ed-so-estreito', onclick: alternarPrevia }, 'Prévia'),
      h('button', { type: 'button', class: 'mini', id: 'pdf', onclick: pdf, title: 'Salva e abre a janela de impressão. Escolha "Salvar como PDF".' }, 'Baixar PDF'),
      h('button', { type: 'button', class: 'mini mini--ativo', id: 'salvar', onclick: () => salvar() }, 'Salvar'),
    ].filter(Boolean));
    pintarEstado();
  }
  acoes.append(h('button', { type: 'button', class: 'mini', onclick: sair }, 'Sair'));
}
function pintarEstado() {
  const el = $('#estado'); if (!el) return;
  const s = suja();
  el.textContent = s ? (est.fatura.id ? 'Alterações não salvas' : 'Ainda não salva') : 'Tudo salvo';
  el.dataset.sujo = s ? '1' : '0';
}

/* ---------- lista ---------- */
async function carregar() {
  try { est.lista = (await api('/api/faturas')).faturas || []; }
  catch (e) { if (!/sessão/.test(e.message)) avisar('Não carreguei: ' + e.message, 'erro'); }
}

function mostrarLista() {
  est.modo = 'lista'; est.fatura = null; est.salva = '';
  history.replaceState(null, '', location.pathname);
  pintarTopo();
  const raiz = $('#app');
  raiz.className = 'ed-raiz fx-raiz--lista';
  raiz.innerHTML = '';

  const conta = { aberta: 0, vencida: 0, paga: 0 };
  est.lista.forEach((f) => { conta[situacao(f)]++; });

  const linhas = est.lista.map((f) => {
    const tipo = tipoDe(f);
    const sit = situacao(f);
    return h('article', { class: 'fx-item' },
      h('button', { type: 'button', class: 'fx-item__abrir', onclick: () => abrir(f.id) },
        h('span', { class: 'fx-tag', 'data-tipo': tipo }, TIPOS[tipo].nome),
        h('span', { class: 'fx-item__quem' },
          h('b', {}, f.cliente || 'Sem cliente'),
          h('small', {}, [f.codigo, f.servico].filter(Boolean).join(' · ') || 'Sem serviço')),
        h('span', { class: 'fx-item__valor' }, dinheiro(f.valor, f.moeda || TIPOS[tipo].moeda, TIPOS[tipo].local)),
        h('span', { class: 'fx-item__data' }, f.paga && f.pagaEm ? 'Paga em ' + dataCurta(f.pagaEm) : 'Vence ' + dataCurta(f.vencimento)),
        h('span', { class: 'fx-sit', 'data-situacao': sit }, ROTULO_SITUACAO[sit])),
      h('div', { class: 'fx-item__acoes' },
        h('button', { type: 'button', class: 'mini', onclick: () => abrirPdf(f.id) }, 'PDF'),
        h('button', { type: 'button', class: 'mini', onclick: () => copiarLink(f.id) }, 'Link'),
        !f.paga && h('button', { type: 'button', class: 'mini', onclick: () => marcarPaga(f.id) }, 'Marcar paga'),
        h('button', { type: 'button', class: 'mini', onclick: () => duplicar(f.id) }, 'Duplicar'),
        h('button', { type: 'button', class: 'mini mini--perigo', onclick: () => apagar(f) }, 'Apagar')));
  });

  raiz.append(h('div', { class: 'fx-lista' },
    h('header', { class: 'ed-lista__cab' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Faturas'),
        h('h1', { class: 'ed-lista__titulo' }, 'Faturas e invoices'),
        h('p', { class: 'ed-lista__apoio' }, 'Fatura em português para cliente do Brasil, invoice em inglês para cliente de fora. Cada uma tem um link próprio e sai em PDF pela impressão.')),
      h('div', { class: 'ed-lista__cta' },
        h('button', { type: 'button', class: 'btn btn--brand', onclick: escolherTipo }, '+ Novo documento'))),
    est.lista.length > 0 && h('div', { class: 'fx-resumo' },
      h('span', { 'data-situacao': 'aberta' }, h('b', {}, String(conta.aberta)), ' em aberto'),
      h('span', { 'data-situacao': 'vencida' }, h('b', {}, String(conta.vencida)), conta.vencida === 1 ? ' vencida' : ' vencidas'),
      h('span', { 'data-situacao': 'paga' }, h('b', {}, String(conta.paga)), conta.paga === 1 ? ' paga' : ' pagas')),
    linhas.length ? h('div', { class: 'fx-itens' }, linhas)
      : h('p', { class: 'ed-vazio' }, 'Nenhum documento ainda. Clique em Novo documento.')));
}

/* ---------- escolher o tipo ---------- */
function escolherTipo() {
  if (!confirmarDescarte()) return;
  est.modo = 'tipo'; est.fatura = null; est.salva = '';
  pintarTopo();
  const raiz = $('#app');
  raiz.className = 'ed-raiz fx-raiz--lista';
  raiz.innerHTML = '';
  const cartao = (tipo, titulo, texto, detalhe) => h('button', { type: 'button', class: 'fx-tipo', onclick: () => nova(tipo) },
    h('span', { class: 'fx-tag', 'data-tipo': tipo }, TIPOS[tipo].nome),
    h('b', { class: 'fx-tipo__titulo' }, titulo),
    h('span', { class: 'fx-tipo__texto' }, texto),
    h('span', { class: 'fx-tipo__detalhe' }, detalhe));
  raiz.append(h('div', { class: 'fx-lista' },
    h('header', { class: 'ed-lista__cab' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Novo documento'),
        h('h1', { class: 'ed-lista__titulo' }, 'O que você vai emitir?'),
        h('p', { class: 'ed-lista__apoio' }, 'O tipo define o idioma do documento e a moeda. Dá para trocar depois, dentro do formulário.'))),
    h('div', { class: 'fx-tipos' },
      cartao('fatura', 'Fatura', 'Para cliente do Brasil. Documento em português, em real, com Pix e dados bancários.', 'Português · R$'),
      cartao('invoice', 'Invoice', 'Para cliente de fora. Documento em inglês, na moeda que ele paga, com SWIFT e IBAN.', 'English · US$, €, £ e outras'))));
}

/* ---------- abrir / nova / duplicar / apagar ---------- */
function confirmarDescarte() { return !suja() || confirm('Há alterações não salvas. Descartar?'); }

async function nova(tipo) {
  let base = {};
  try { base = await api('/api/fatura-base?tipo=' + tipo); } catch (e) { /* segue com o padrão */ }
  const hoje = hojeIso();
  const f = {
    id: '', tipo, codigo: proximoCodigo(tipo),
    emissao: hoje, vencimento: somarDias(hoje, 15),
    moeda: TIPOS[tipo].moeda, valor: 0,
    servico: { titulo: '', descricao: '' },
    emissor: base.emissor || clonar(EMISSOR_PADRAO),
    cliente: { nome: '', documento: '', endereco: '' },
    pagamento: base.pagamento || clonar(TIPOS[tipo].pagamento),
    paga: false,
  };
  abrirEditor(f, true);
  setTimeout(() => $('[data-foco]')?.focus(), 60);
}

async function abrir(id) {
  if (!confirmarDescarte()) return;
  try {
    abrirEditor(await api('/api/faturas/' + encodeURIComponent(id)), false);
    history.replaceState(null, '', '#' + id);
  } catch (e) { avisar('Não abri: ' + e.message, 'erro'); }
}

async function duplicar(id) {
  if (!confirmarDescarte()) return;
  try {
    const f = await api('/api/faturas/' + encodeURIComponent(id));
    const hoje = hojeIso();
    // Mesmo cliente e serviço; número, datas e situação novos.
    const prazo = f.emissao && f.vencimento
      ? Math.round((new Date(f.vencimento) - new Date(f.emissao)) / 86400000) : 15;
    delete f.criadaEm; delete f.atualizadaEm; delete f.pagaEm;
    Object.assign(f, { id: '', codigo: proximoCodigo(tipoDe(f)), emissao: hoje, vencimento: somarDias(hoje, Math.max(0, prazo)), paga: false });
    abrirEditor(f, true);
    avisar('Cópia aberta com número e datas novos. Confira e salve.');
  } catch (e) { avisar('Não dupliquei: ' + e.message, 'erro'); }
}

async function apagar(f) {
  if (!confirm('Apagar ' + TIPOS[tipoDe(f)].nome.toLowerCase() + ' ' + (f.codigo || '') + ' de ' + (f.cliente || 'sem cliente') + '? O link para de funcionar.')) return;
  try {
    await api('/api/faturas/' + encodeURIComponent(f.id), { method: 'DELETE' });
    avisar('Apagada.');
    await carregar(); mostrarLista();
  } catch (e) { avisar('Não apaguei: ' + e.message, 'erro'); }
}

async function marcarPaga(id) {
  try {
    const f = await api('/api/faturas/' + encodeURIComponent(id));
    f.paga = true; f.pagaEm = hojeIso();
    await enviarJson('/api/faturas', 'POST', f);
    avisar((f.codigo || 'Fatura') + ' marcada como paga.');
    await carregar(); mostrarLista();
  } catch (e) { avisar('Não marquei: ' + e.message, 'erro'); }
}

function voltarParaLista() {
  if (!confirmarDescarte()) return;
  est.salva = JSON.stringify(est.fatura);
  mostrarLista();
}

/* ---------- editor ---------- */
function abrirEditor(f, nova) {
  est.fatura = f; est.modo = 'editor';
  f.servico ||= {}; f.emissor ||= {}; f.cliente ||= {};
  if (!Array.isArray(f.pagamento)) f.pagamento = [];
  est.salva = nova ? '' : JSON.stringify(f);
  pintarTopo();

  const raiz = $('#app');
  raiz.className = 'ed-raiz fx-editor';
  raiz.innerHTML = '';
  raiz.append(
    h('div', { class: 'ed-form', id: 'form' }),
    h('aside', { class: 'ed-previa', id: 'previa', 'aria-label': 'Prévia' },
      h('div', { class: 'ed-previa__barra' },
        h('b', {}, 'Prévia ao vivo'),
        h('div', { class: 'ed-seg', role: 'group' },
          ...[['folha', 'Folha A4'], ['celular', 'Celular']].map(([m, r]) => h('button', { type: 'button', 'data-modo': m, 'aria-pressed': String(est.previa === m), onclick: () => trocarModoPrevia(m) }, r))),
        h('button', { type: 'button', class: 'ed-icobtn ed-so-estreito', title: 'Fechar prévia', html: '&times;', onclick: alternarPrevia })),
      h('div', { class: 'ed-previa__palco fx-palco', id: 'palco' },
        h('div', { class: 'ed-previa__moldura', id: 'moldura' },
          h('iframe', { id: 'quadro', title: 'Prévia do documento', tabindex: '-1' })))));
  quadroPronto = false;
  pintarForm();
  medirPrevia();
  pedirPrevia(0);
}

function campoData(obj, chaveData, rotulo, dica) {
  const el = texto(obj, chaveData, rotulo, { tipo: 'date', dica });
  return el;
}

// Número com centavos; vazio em vez de "0" quando ainda não tem valor.
function campoValor(f) {
  const el = texto(f, 'valor', 'Valor', { tipo: 'number', dica: 'Só o número, já na moeda escolhida. Ex.: 1500 ou 1500.50' });
  const input = el.querySelector('input');
  input.step = '0.01'; input.min = '0'; input.inputMode = 'decimal';
  if (!Number(f.valor)) input.value = '';
  return el;
}

function seletorMoeda(f) {
  const sel = h('select', {}, MOEDAS.map(([c, r]) => h('option', { value: c }, c + '  ' + r)));
  sel.value = f.moeda || TIPOS[tipoDe(f)].moeda;
  sel.addEventListener('change', () => { f.moeda = sel.value; mudou(); });
  return h('label', { class: 'ed-campo' }, h('span', { class: 'ed-campo__rot' }, 'Moeda'), sel);
}

function editorPares(f) {
  const raiz = h('div', { class: 'ed-pares' });
  const pintar = () => {
    raiz.innerHTML = '';
    f.pagamento.forEach((par, i) => {
      const r = h('input', { type: 'text', placeholder: 'SWIFT' }); r.value = par[0] || '';
      const v = h('input', { type: 'text', placeholder: 'Valor' }); v.value = par[1] || '';
      r.addEventListener('input', () => { par[0] = r.value; mudou(); });
      v.addEventListener('input', () => { par[1] = v.value; mudou(); });
      raiz.append(h('div', { class: 'ed-par' }, r, v,
        h('button', { type: 'button', class: 'ed-icobtn ed-icobtn--perigo', title: 'Remover', html: '&times;', onclick: () => { f.pagamento.splice(i, 1); mudou(); pintar(); } })));
    });
    raiz.append(h('button', { type: 'button', class: 'ed-adicionar', onclick: () => { f.pagamento.push(['', '']); mudou(); pintar(); } }, '+ Adicionar dado'));
  };
  pintar();
  return raiz;
}

function pintarForm() {
  const form = $('#form'); if (!form) return;
  const f = est.fatura;
  const tipo = tipoDe(f);
  const invoice = tipo === 'invoice';
  form.innerHTML = '';

  // Prazo rápido: conta a partir da emissão.
  const vencimento = campoData(f, 'vencimento', 'Vencimento', 'Data limite para o cliente pagar.');
  const atalhos = h('div', { class: 'ed-opcoes fx-atalhos' },
    [['Na hora', 0], ['7 dias', 7], ['15 dias', 15], ['30 dias', 30]].map(([r, n]) => h('button', {
      type: 'button', onclick: () => { f.vencimento = somarDias(f.emissao, n); vencimento.querySelector('input').value = f.vencimento; mudou(); },
    }, r)));

  const trocarTipo = (novo) => {
    if (novo === tipo) return;
    const antes = TIPOS[tipo], depois = TIPOS[novo];
    f.tipo = novo;
    if (!f.moeda || f.moeda === antes.moeda) f.moeda = depois.moeda;
    // número e dados de pagamento acompanham, se ainda estiverem no padrão
    if (!f.codigo || f.codigo.startsWith(antes.prefixo + '-')) f.codigo = proximoCodigo(novo);
    if (!f.pagamento.some((p) => p[1])) f.pagamento = clonar(depois.pagamento);
    mudou(); pintarTopo(); pintarForm();
  };

  const clienteNome = texto(f.cliente, 'nome', 'Nome do cliente', { placeholder: invoice ? 'Hunter Interior Design LLC' : 'Clínica Sorriso Leve Ltda' });
  clienteNome.querySelector('input').setAttribute('data-foco', '');

  const corpo = h('div', { class: 'ed-form__corpo' },
    bloco('Documento', { filhos: [
      h('div', { class: 'ed-campo' },
        h('span', { class: 'ed-campo__rot' }, 'Tipo'),
        h('div', { class: 'ed-opcoes' }, ['fatura', 'invoice'].map((t) => h('button', { type: 'button', 'aria-pressed': String(t === tipo), onclick: () => trocarTipo(t) },
          t === 'fatura' ? 'Fatura · português' : 'Invoice · inglês'))),
        h('small', { class: 'ed-campo__dica' }, invoice ? 'Documento em inglês, para cliente de fora.' : 'Documento em português, para cliente do Brasil.')),
      texto(f, 'codigo', 'Número', { dica: 'Opcional. Sai no topo do documento e organiza o controle de emissão.' }),
      linha(campoData(f, 'emissao', 'Emissão'), vencimento),
      h('div', { class: 'ed-campo' }, h('span', { class: 'ed-campo__rot' }, 'Vence em'), atalhos),
    ] }),

    bloco('Cliente', { filhos: [
      clienteNome,
      texto(f.cliente, 'documento', invoice ? 'Tax ID' : 'CPF ou CNPJ', { dica: 'Opcional.', placeholder: invoice ? 'EIN, VAT ou NIF' : '000.000.000-00 ou 00.000.000/0000-00' }),
      texto(f.cliente, 'endereco', 'Endereço', { area: true, linhas: 2, dica: 'Opcional. Enter quebra a linha.' }),
    ] }),

    bloco('Serviço e valor', { filhos: [
      texto(f.servico, 'titulo', 'Título do serviço', { placeholder: invoice ? 'Website design and development' : 'Criação de site institucional' }),
      texto(f.servico, 'descricao', 'Descrição', { area: true, linhas: 4, dica: 'O que foi feito ou entregue. Enter quebra a linha.' }),
      linha(seletorMoeda(f), campoValor(f)),
    ] }),

    bloco('Prestador', { dica: 'Seus dados. A próxima fatura já nasce com eles.', filhos: [
      texto(f.emissor, 'nome', 'Razão social ou nome', { placeholder: 'Samuel Freire' }),
      texto(f.emissor, 'documento', 'CNPJ', { dica: 'Opcional.', placeholder: '00.000.000/0000-00' }),
      texto(f.emissor, 'endereco', 'Endereço', { area: true, linhas: 2, dica: 'Opcional.' }),
      linha(texto(f.emissor, 'telefone', 'Telefone', { dica: 'Opcional.' }), texto(f.emissor, 'email', 'E-mail')),
    ] }),

    bloco('Dados para pagamento', {
      dica: invoice ? 'SWIFT e IBAN, ou os dados da conta que recebe em dólar (Wise, Payoneer). Linha sem valor não aparece.' : 'Pix, banco, agência e conta. Linha sem valor não aparece.',
      filhos: [editorPares(f)],
    }),

    bloco('Situação', { filhos: [
      chave({
        rotulo: 'Paga', dica: 'O documento passa a mostrar "Paga" e o valor pago.',
        ler: () => Boolean(f.paga),
        escrever: (v) => { f.paga = v; if (v && !f.pagaEm) f.pagaEm = hojeIso(); if (!v) delete f.pagaEm; pintarForm(); },
      }),
      f.paga && campoData(f, 'pagaEm', 'Paga em'),
    ] }));

  form.append(
    h('header', { class: 'ed-form__cab' },
      h('p', { class: 'ed-form__passo' }, TIPOS[tipo].nome),
      h('h2', { class: 'ed-form__titulo' }, f.id ? (f.cliente.nome || 'Sem cliente') : (invoice ? 'Nova invoice' : 'Nova fatura')),
      h('p', { class: 'ed-form__resumo' }, 'Preencha os campos e confira a folha na prévia. Baixar PDF salva e abre a impressão: escolha "Salvar como PDF".')),
    corpo,
    h('footer', { class: 'ed-form__pe' },
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: pdf }, 'Baixar PDF'),
      h('button', { type: 'button', class: 'btn btn--brand', onclick: () => salvar() }, 'Salvar')));
}

/* ---------- mudanças ---------- */
function mudou() {
  pintarEstado();
  pedirPrevia();
}
ctx.mudou = mudou;

/* ---------- prévia ----------
   A primeira vez a página entra inteira no iframe; depois só o
   <body> é trocado, para a folha não piscar a cada letra. */
let tPrevia, seqPrevia = 0, quadroPronto = false;
function pedirPrevia(atraso = 300) { clearTimeout(tPrevia); tPrevia = setTimeout(atualizarPrevia, atraso); }

async function atualizarPrevia() {
  const quadro = $('#quadro'); if (!quadro || est.modo !== 'editor') return;
  const n = ++seqPrevia;
  let html;
  try {
    const r = await fetch('/api/fatura-previa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(est.fatura) });
    if (!r.ok) throw new Error('erro ' + r.status);
    html = await r.text();
  } catch (e) { avisar('A prévia não atualizou: ' + e.message, 'erro'); return; }
  if (n !== seqPrevia) return;

  const doc = quadro.contentDocument;
  if (!quadroPronto || !doc?.body) {
    quadro.onload = () => { quadroPronto = true; medirPrevia(); };
    quadro.srcdoc = html;
    return;
  }
  const novo = new DOMParser().parseFromString(html, 'text/html');
  doc.documentElement.lang = novo.documentElement.lang;
  doc.body.className = novo.body.className;
  doc.body.innerHTML = novo.body.innerHTML;
  medirPrevia();
}

// A folha é desenhada a 794px (A4 a 96 dpi) e reduzida para caber;
// o celular, a 390px. A altura acompanha o conteúdo.
function medirPrevia() {
  const palco = $('#palco'), moldura = $('#moldura'), quadro = $('#quadro');
  if (!palco || !quadro) return;
  const largura = est.previa === 'celular' ? 390 : 794;
  const escala = Math.min(1, (palco.clientWidth - 32) / largura);
  const doc = quadro.contentDocument;
  const conteudo = doc?.documentElement ? doc.documentElement.scrollHeight : 1123;
  const altura = Math.max(est.previa === 'celular' ? 700 : 1123, conteudo);
  quadro.style.width = largura + 'px';
  quadro.style.height = altura + 'px';
  quadro.style.transform = 'scale(' + escala + ')';
  moldura.style.width = largura * escala + 'px';
  moldura.style.height = altura * escala + 'px';
  moldura.dataset.modo = est.previa === 'celular' ? 'celular' : 'folha';
}
function trocarModoPrevia(m) {
  est.previa = m;
  document.querySelectorAll('.ed-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
  medirPrevia();
  requestAnimationFrame(medirPrevia);
}
function alternarPrevia() {
  document.body.classList.toggle('ed-previa-aberta');
  requestAnimationFrame(medirPrevia);
}
new ResizeObserver(() => medirPrevia()).observe(document.documentElement);

/* ---------- salvar e PDF ---------- */
function conferir(f) {
  if (!f.cliente?.nome?.trim()) return 'Falta o nome do cliente.';
  if (!f.servico?.titulo?.trim()) return 'Falta o título do serviço.';
  if (!(Number(f.valor) > 0)) return 'Falta o valor.';
  if (!f.vencimento) return 'Falta o vencimento.';
  if (!f.emissor?.nome?.trim()) return 'Falta o nome do prestador.';
  return '';
}

async function salvar({ quieto = false } = {}) {
  const f = est.fatura;
  const falta = conferir(f);
  if (falta) { avisar(falta, 'erro'); return false; }
  const b = $('#salvar'); if (b) { b.disabled = true; b.textContent = 'Salvando…'; }
  try {
    const r = await enviarJson('/api/faturas', 'POST', f);
    est.fatura = r.fatura; est.salva = JSON.stringify(r.fatura);
    history.replaceState(null, '', '#' + r.id);
    await carregar();
    pintarTopo(); pintarForm(); pedirPrevia(0);
    if (!quieto) avisar('Salva. Link: ' + location.origin + r.url);
    return true;
  } catch (e) { avisar('Não salvou: ' + e.message, 'erro'); return false; }
  finally { const b2 = $('#salvar'); if (b2) { b2.disabled = false; b2.textContent = 'Salvar'; } }
}

// A aba nova abre já no clique (senão o navegador bloqueia) e recebe
// o endereço depois de salvar.
async function pdf() {
  const f = est.fatura;
  const falta = conferir(f);
  if (falta) { avisar(falta, 'erro'); return; }
  const aba = window.open('', '_blank');
  if (suja() || !f.id) {
    const ok = await salvar({ quieto: true });
    if (!ok) { aba?.close(); return; }
  }
  const url = '/faturas/' + est.fatura.id + '?imprimir=1';
  if (aba) aba.location = url; else location.href = url;
}

/* ---------- geral ---------- */
async function sair() {
  if (suja() && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
  await fetch('/api/sair', { method: 'POST' });
  location.replace('/admin/entrar');
}
addEventListener('beforeunload', (e) => { if (suja()) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && est.modo === 'editor') { e.preventDefault(); salvar(); }
});

await carregar();
const inicial = decodeURIComponent(location.hash.slice(1));
if (inicial && est.lista.some((f) => f.id === inicial)) abrir(inicial);
else mostrarLista();
