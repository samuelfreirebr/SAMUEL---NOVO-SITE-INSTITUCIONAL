/* ============================================================
   Preencher a proposta com IA.

   Recebe o material bruto de uma conversa com o lead (texto colado,
   prints, transcrição, PDF, DOCX, ZIP com tudo isso dentro), manda
   para a OpenAI com um esquema fixo de resposta e aplica o que
   voltou SÓ nos campos permitidos:

     cliente, título de impacto, data, valor e parcelas, entregáveis,
     prazo em dias (só a condição do prazo), a condição de ferramentas
     e hospedagem (só se o material fala disso) e as perguntas do fim.

   Processo, Sobre mim, Ecossistema, O que inclui, pagamento,
   encerramento e as outras condições não entram no esquema: a IA
   não tem como mexer neles nem querendo.

   Chave: OPENAI_API_KEY na stack. Modelo: OPENAI_MODELO (padrão
   gpt-4.1). Sem chave, a rota explica em vez de falhar em silêncio.
   ============================================================ */

import { inflateRawSync } from 'node:zlib';

const LIMITE_TOTAL = 30 * 1024 * 1024;   // 30 MB de anexos por pedido
const LIMITE_TEXTO = 60000;               // caracteres de texto que vão para a IA
const MAX_ARQUIVOS = 24;

export const temChaveIa = () => Boolean(process.env.OPENAI_API_KEY);

/* Qual modelo usar: o da stack, se a conta tiver acesso; senão o
   melhor da lista que a chave alcança. Cada conta da OpenAI libera
   modelos diferentes por projeto, e "não tem acesso ao gpt-4.1" foi
   o primeiro erro real. A lista da conta fica em cache por uma hora. */
const PREFERENCIA = ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-nano'];
let modelosDaConta = null;
let quandoListou = 0;

async function listarModelos() {
  if (modelosDaConta && Date.now() - quandoListou < 60 * 60 * 1000) return modelosDaConta;
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(d.data)) { modelosDaConta = new Set(d.data.map((m) => m.id)); quandoListou = Date.now(); }
  } catch (e) { /* sem lista: tenta na ordem e deixa o erro dizer */ }
  return modelosDaConta;
}

export async function escolherModelo() {
  const pedido = process.env.OPENAI_MODELO;
  const lista = await listarModelos();
  if (!lista) return pedido || PREFERENCIA[2];
  if (pedido && lista.has(pedido)) return pedido;
  return PREFERENCIA.find((m) => lista.has(m)) || pedido || PREFERENCIA[2];
}

/* ---------- ZIP mínimo: só o que precisamos ----------
   Lê o diretório central e infla cada entrada. Sem dependência,
   como o resto do servidor. Entrada cifrada ou com método diferente
   de "guardado" e "deflate" é pulada. */
function lerZip(buf) {
  const saida = [];
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) return saida;
  const total = buf.readUInt16LE(fim + 10);
  let pos = buf.readUInt32LE(fim + 16);
  for (let n = 0; n < total && pos + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(pos + 10);
    const tamComp = buf.readUInt32LE(pos + 20);
    const tamNome = buf.readUInt16LE(pos + 28);
    const tamExtra = buf.readUInt16LE(pos + 30);
    const tamCom = buf.readUInt16LE(pos + 32);
    const offset = buf.readUInt32LE(pos + 42);
    const nome = buf.slice(pos + 46, pos + 46 + tamNome).toString('utf8');
    pos += 46 + tamNome + tamExtra + tamCom;
    if (nome.endsWith('/') || offset + 30 > buf.length) continue;
    if (buf.readUInt32LE(offset) !== 0x04034b50) continue;
    const lNome = buf.readUInt16LE(offset + 26);
    const lExtra = buf.readUInt16LE(offset + 28);
    const ini = offset + 30 + lNome + lExtra;
    const dados = buf.slice(ini, ini + tamComp);
    try {
      if (metodo === 0) saida.push({ nome, bytes: dados });
      else if (metodo === 8) saida.push({ nome, bytes: inflateRawSync(dados) });
    } catch (e) { /* entrada corrompida: pula */ }
  }
  return saida;
}

const decodificarEntidades = (t) => t
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');

function textoDoDocx(buf) {
  const doc = lerZip(buf).find((e) => e.nome === 'word/document.xml');
  if (!doc) return '';
  return decodificarEntidades(doc.bytes.toString('utf8')
    .replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

const EH_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;
const EH_TEXTO = /\.(txt|md|markdown|csv|json|html?|xml|srt|vtt|rtf|log)$/i;
const MIME_IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/* Transforma cada anexo em partes que a IA entende: texto, imagem ou
   PDF. ZIP e DOCX são abertos aqui. Devolve também o resumo do que
   foi lido, para o painel mostrar. */
function prepararAnexos(arquivos) {
  const partes = [];
  const lidos = [];
  let total = 0;

  const empurrar = (nome, tipo, bytes, profundidade = 0) => {
    if (partes.length >= MAX_ARQUIVOS) return;
    total += bytes.length;
    if (total > LIMITE_TOTAL) throw new Error('Os anexos passam de 30 MB. Mande menos de uma vez.');
    const ext = (nome.split('.').pop() || '').toLowerCase();

    if (EH_IMAGEM.test(nome) || /^image\//.test(tipo)) {
      const mime = MIME_IMG[ext] || tipo || 'image/png';
      partes.push({ type: 'input_image', image_url: `data:${mime};base64,${bytes.toString('base64')}`, detail: 'high' });
      lidos.push({ nome, como: 'imagem' });
      return;
    }
    if (ext === 'pdf' || tipo === 'application/pdf') {
      partes.push({ type: 'input_file', filename: nome, file_data: `data:application/pdf;base64,${bytes.toString('base64')}` });
      lidos.push({ nome, como: 'PDF' });
      return;
    }
    if (ext === 'docx') {
      const t = textoDoDocx(bytes);
      if (t) { partes.push({ type: 'input_text', text: `--- Arquivo: ${nome} ---\n${t.slice(0, LIMITE_TEXTO)}` }); lidos.push({ nome, como: 'documento Word' }); }
      else lidos.push({ nome, como: 'Word sem texto legível' });
      return;
    }
    if (ext === 'zip' && profundidade < 2) {
      const entradas = lerZip(bytes);
      lidos.push({ nome, como: `ZIP com ${entradas.length} arquivo(s)` });
      for (const e of entradas) {
        if (/(^|\/)(__MACOSX|\.DS_Store|thumbs\.db)/i.test(e.nome)) continue;
        empurrar(e.nome.split('/').pop(), '', e.bytes, profundidade + 1);
      }
      return;
    }
    if (EH_TEXTO.test(nome) || /^text\//.test(tipo)) {
      let t = bytes.toString('utf8');
      if (/\.html?$/i.test(nome)) t = decodificarEntidades(t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
      partes.push({ type: 'input_text', text: `--- Arquivo: ${nome} ---\n${t.slice(0, LIMITE_TEXTO)}` });
      lidos.push({ nome, como: 'texto' });
      return;
    }
    lidos.push({ nome, como: 'formato não lido (use texto, imagem, PDF, DOCX ou ZIP)' });
  };

  for (const a of arquivos) empurrar(a.nome || 'arquivo', a.tipo || '', a.bytes);
  return { partes, lidos };
}

/* ---------- o pedido à IA ---------- */

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['cliente', 'titulo', 'subtitulo', 'data', 'investimento', 'escopo', 'prazoDias', 'hospedagem', 'perguntas', 'observacoes'],
  properties: {
    cliente: { type: 'string', description: 'Nome do cliente ou da empresa. Vazio se não aparecer.' },
    titulo: { type: 'string', description: 'Frase de impacto da capa, curta, no tom de um designer confiante. Vazio se não houver base.' },
    subtitulo: { type: 'string', description: 'Uma linha dizendo o que a proposta cobre.' },
    data: { type: 'string', description: 'Data da proposta em português, por extenso. Vazio se não aparecer.' },
    investimento: {
      type: 'object', additionalProperties: false,
      required: ['encontrado', 'moeda', 'parcelas', 'valorParcela'],
      properties: {
        encontrado: { type: 'boolean' },
        moeda: { type: 'string', enum: ['R$', '$', '€'] },
        parcelas: { type: 'integer' },
        valorParcela: { type: 'number', description: 'Valor de CADA parcela. À vista: parcelas 1 e o valor total.' },
      },
    },
    escopo: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['titulo', 'descricao', 'marca'],
        properties: {
          titulo: { type: 'string' },
          descricao: { type: 'string', description: 'Uma ou duas frases concretas do que será feito.' },
          marca: { type: 'string', description: 'Etiqueta curta: Identidade, Web, Impresso, Sistema, Marketing.' },
        },
      },
    },
    prazoDias: { type: 'integer', description: 'Prazo em dias úteis. 0 se o material não diz.' },
    hospedagem: {
      type: 'object', additionalProperties: false,
      required: ['mencionada', 'texto'],
      properties: {
        mencionada: { type: 'boolean', description: 'true SÓ se o material fala de quem paga hospedagem, domínio, plugins ou ferramentas.' },
        texto: { type: 'string', description: 'Se mencionada: o texto da condição, refletindo o combinado.' },
      },
    },
    perguntas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['pergunta', 'resposta'],
        properties: { pergunta: { type: 'string' }, resposta: { type: 'string' } },
      },
    },
    observacoes: { type: 'string', description: 'O que não foi encontrado ou ficou em dúvida, em uma ou duas frases.' },
  },
};

const SISTEMA = `Você preenche propostas comerciais para Samuel Freire, web designer brasileiro que faz sites, landing pages, identidade visual, materiais impressos e sistemas para negócios. Você recebe o material de uma conversa com o cliente (texto, prints, transcrição, arquivos) e devolve SÓ os campos do esquema, em português do Brasil.

Regras:
- Use apenas o que está no material. Não invente valor, prazo, nome ou serviço que não apareça. Campo sem base fica vazio (ou 0 / false).
- Entregáveis: transforme o que foi combinado em itens claros e bem estruturados, um por entrega, com descrição concreta. Agrupe o que é a mesma coisa; separe o que é entrega diferente. Nada de item genérico como "site" sem dizer o quê.
- Título: uma frase de impacto curta para a capa, ligada ao objetivo do cliente (ex.: "Escala não é acaso. É posicionamento."). Sem travessão, sem ponto e vírgula.
- Investimento: se o material diz valor e forma (à vista, 2x, 3x), preencha; "encontrado" só é true com valor real.
- Prazo: só em dias úteis, só se o material diz.
- Hospedagem e ferramentas: "mencionada" só é true se o material diz quem paga ou inclui hospedagem, domínio, plugins ou ferramentas. Nesse caso escreva a condição refletindo o combinado.
- Perguntas: as dúvidas que o cliente ainda parece ter (perguntou e não foi respondido, hesitou, pediu para confirmar). Responda cada uma de forma curta e segura, como o Samuel responderia. De 3 a 6 perguntas. Se o material não mostra dúvida nenhuma, devolva lista vazia.
- Nunca use travessão (o caractere de traço longo). Use vírgula, dois-pontos ou ponto.`;

function resumoAtual(p) {
  const cond = (p.condicoes || []).map((c) => c.titulo).join(' | ');
  return `Proposta atual (para você saber o que já existe; mude só o que o material justificar):
- cliente: ${p.cliente || '(vazio)'}
- título atual: ${p.titulo || '(vazio)'}
- entregáveis atuais: ${(p.escopo || []).map((e) => e.titulo).join(' | ') || '(nenhum)'}
- investimento atual: ${p.investimento?.valorParcela ? `${p.investimento.parcelas}x ${p.investimento.moeda} ${p.investimento.valorParcela}` : '(vazio)'}
- condições (títulos): ${cond}
- perguntas atuais: ${(p.faq?.itens || []).map((f) => f.pergunta).join(' | ') || '(nenhuma)'}`;
}

async function chamarOpenAi(partes, modeloEscolhido) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: modeloEscolhido,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SISTEMA }] },
        { role: 'user', content: partes },
      ],
      text: { format: { type: 'json_schema', name: 'proposta_preenchida', schema: ESQUEMA, strict: true } },
      max_output_tokens: 4000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.error?.message || `OpenAI respondeu ${r.status}`;
    const e = new Error(/api key|authentication|incorrect/i.test(msg) ? 'A chave OPENAI_API_KEY não foi aceita. Confira na stack.' : msg);
    e.semAcesso = /does not have access|model_not_found|not found/i.test(msg);
    throw e;
  }
  const texto = d.output_text
    || (d.output || []).flatMap((o) => o.content || []).map((c) => c.text || '').join('');
  if (!texto) throw new Error('A IA não devolveu conteúdo.');
  try { return JSON.parse(texto); }
  catch (e) { throw new Error('A IA devolveu algo fora do formato esperado.'); }
}

/* ---------- aplicar só o permitido ---------- */

const apelidar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const semTravessao = (t) => String(t || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/,\s*,/g, ',');
const limpo = (t) => semTravessao(t).trim();

export function aplicarNaProposta(p, ia) {
  const mudancas = [];
  const saida = JSON.parse(JSON.stringify(p));

  if (limpo(ia.cliente)) {
    saida.cliente = limpo(ia.cliente);
    if (!saida.preparadaPara) saida.preparadaPara = saida.cliente;
    if (!saida.id) saida.id = apelidar(saida.cliente);
    mudancas.push('nome do cliente');
  }
  if (limpo(ia.titulo)) { saida.titulo = limpo(ia.titulo); mudancas.push('frase de impacto'); }
  if (limpo(ia.subtitulo)) { saida.subtitulo = limpo(ia.subtitulo); mudancas.push('linha de apoio'); }

  saida.data = limpo(ia.data) || new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  mudancas.push(limpo(ia.data) ? 'data' : 'data (hoje, o material não dizia)');

  const inv = ia.investimento;
  if (inv?.encontrado && inv.valorParcela > 0) {
    saida.investimento = { ...(saida.investimento || {}), moeda: inv.moeda || 'R$', parcelas: Math.max(1, inv.parcelas || 1), valorParcela: inv.valorParcela };
    mudancas.push(`valor (${saida.investimento.parcelas}x ${saida.investimento.moeda} ${saida.investimento.valorParcela})`);
  }

  const escopo = (ia.escopo || []).filter((e) => limpo(e.titulo)).map((e) => ({ titulo: limpo(e.titulo), descricao: limpo(e.descricao), marca: limpo(e.marca) }));
  if (escopo.length) { saida.escopo = escopo; mudancas.push(`${escopo.length} entregáveis`); }

  if (Array.isArray(saida.condicoes)) {
    if (ia.prazoDias > 0) {
      const c = saida.condicoes.find((x) => /prazo/i.test(x.titulo || ''));
      if (c) { c.titulo = `Prazo médio: ${ia.prazoDias} dias`; mudancas.push(`prazo (${ia.prazoDias} dias)`); }
    }
    if (ia.hospedagem?.mencionada && limpo(ia.hospedagem.texto)) {
      const c = saida.condicoes.find((x) => /ferramenta|hospedagem/i.test(x.titulo || ''));
      if (c) { c.texto = limpo(ia.hospedagem.texto); mudancas.push('ferramentas e hospedagem'); }
    }
  }

  const perguntas = (ia.perguntas || []).filter((f) => limpo(f.pergunta) && limpo(f.resposta)).map((f) => ({ pergunta: limpo(f.pergunta), resposta: limpo(f.resposta) }));
  if (perguntas.length) {
    saida.faq = { ...(saida.faq || {}), itens: perguntas };
    mudancas.push(`${perguntas.length} perguntas`);
  }

  return { proposta: saida, mudancas, observacoes: limpo(ia.observacoes) };
}

/* ---------- entrada ---------- */

export async function preencherComIa({ proposta, texto, arquivos }) {
  if (!temChaveIa()) return { erro: 'Sem chave da OpenAI. Defina OPENAI_API_KEY nas variáveis da stack no Portainer e atualize.' };
  const t = String(texto || '').trim();
  if (!t && !(arquivos || []).length) return { erro: 'Cole o texto da conversa ou anexe pelo menos um arquivo.' };

  let anexos;
  try { anexos = prepararAnexos(arquivos || []); }
  catch (e) { return { erro: e.message }; }

  const partes = [{ type: 'input_text', text: resumoAtual(proposta || {}) }];
  if (t) partes.push({ type: 'input_text', text: `--- Material colado ---\n${t.slice(0, LIMITE_TEXTO)}` });
  partes.push(...anexos.partes);
  if (partes.length === 1) return { erro: 'Nenhum anexo pôde ser lido. Use texto, imagem, PDF, DOCX ou ZIP.', lidos: anexos.lidos };

  // Tenta o modelo escolhido; se a conta não tiver acesso, desce a
  // lista de preferência até um que funcione.
  let ia, usado;
  const tentar = [await escolherModelo(), ...PREFERENCIA];
  let ultimoErro;
  for (const m of [...new Set(tentar)]) {
    try { ia = await chamarOpenAi(partes, m); usado = m; break; }
    catch (e) { ultimoErro = e; if (!e.semAcesso) break; }
  }
  if (!ia) return { erro: ultimoErro?.message || 'A IA não respondeu.', lidos: anexos.lidos };

  return { ...aplicarNaProposta(proposta || {}, ia), lidos: anexos.lidos, modelo: usado };
}
