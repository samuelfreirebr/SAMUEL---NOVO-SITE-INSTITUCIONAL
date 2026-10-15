/* ============================================================
   Cofre: links úteis, prompts e textos do Samuel. Só o painel enxerga.

   Tudo num arquivo só (/dados/cofre.json): são algumas centenas de
   itens pequenos, e a busca e os filtros rodam no navegador.

   Ao guardar um link, o servidor lê a página do link (no GitHub, o
   README pela API), manda para a mesma IA das propostas (ChatGPT, pela
   OPENAI_API_KEY) e devolve nome, descrição, categoria e tags. Sem a
   chave, devolve só o título e a
   descrição da página. Endereço da rede interna
   (localhost, IP privado) é recusado antes de qualquer leitura.
   ============================================================ */

import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { RAIZ_DADOS } from './dados.js';
import { pedirJsonIa, temChaveIa, prepararAnexos } from './proposta-ia.js';

const ARQ = path.join(RAIZ_DADOS, 'cofre.json');
export const CATEGORIAS = ['prompts', 'textos', 'ferramentas', 'github', 'videos', 'ia', 'docs', 'arquivos', 'outros'];
export const temChaveCofre = temChaveIa;

/* ---------- guardar ---------- */

let fila = Promise.resolve();
const naFila = (fn) => { const r = fila.then(fn, fn); fila = r.catch(() => {}); return r; };

export async function listar() {
  try { return JSON.parse(await fs.readFile(ARQ, 'utf8')); }
  catch (e) { return []; }
}

async function gravar(lista) {
  await fs.mkdir(RAIZ_DADOS, { recursive: true });
  await fs.writeFile(ARQ + '.tmp', JSON.stringify(lista, null, 2), 'utf8');
  await fs.rename(ARQ + '.tmp', ARQ);
}

const corte = (v, max) => String(v ?? '').trim().slice(0, max);

function limpar(d) {
  const url = corte(d.url, 2000);
  if (url && !/^https?:\/\//i.test(url)) throw new Error('O link precisa começar com http:// ou https://.');
  const nome = corte(d.nome, 160);
  if (!nome) throw new Error('Dê um nome ao item.');
  const tags = (Array.isArray(d.tags) ? d.tags : String(d.tags || '').split(','))
    .map((t) => corte(t, 30).toLowerCase()).filter(Boolean);
  return {
    url, nome,
    descricao: corte(d.descricao, 8000),
    conteudo: String(d.conteudo ?? '').slice(0, 50000).trim(),   // o texto colado, intacto
    categoria: CATEGORIAS.includes(d.categoria) ? d.categoria : 'outros',
    tags: [...new Set(tags)].slice(0, 12),
    fixado: Boolean(d.fixado),
  };
}

// Sem id cria; com id troca o item inteiro, guardando a data de criação.
export function salvar(dado) {
  return naFila(async () => {
    const item = limpar(dado || {});
    const lista = await listar();
    const agora = new Date().toISOString();
    const i = dado.id ? lista.findIndex((x) => x.id === dado.id) : -1;
    if (dado.id && i < 0) throw new Error('Item não encontrado.');
    const salvo = i >= 0
      ? { ...lista[i], ...item, atualizadoEm: agora }
      : { id: randomBytes(6).toString('hex'), ...item, criadoEm: agora, atualizadoEm: agora };
    if (i >= 0) lista[i] = salvo; else lista.unshift(salvo);
    await gravar(lista);
    return salvo;
  });
}

export function apagar(id) {
  return naFila(async () => {
    const lista = await listar();
    const resto = lista.filter((x) => x.id !== id);
    if (resto.length === lista.length) return false;
    await gravar(resto);
    return true;
  });
}

/* ---------- ler a página, sem tocar na rede interna ---------- */

export function ipInterno(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return ipInterno(v.slice(7));
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)   // CGNAT
    || (a === 169 && b === 254)             // link-local, metadados de nuvem
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

async function conferirEndereco(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Só dá para ler links http ou https.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new Error('Esse endereço é da rede interna.');
  const ips = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(ipInterno)) throw new Error('Esse endereço é da rede interna.');
}

// ponytail: confere o DNS antes de cada pedido, mas o fetch resolve de
// novo (DNS rebinding passaria). Fixar o IP no socket se isso importar.
async function baixar(url, cabecalhos = {}, saltos = 4) {
  await conferirEndereco(url);
  const r = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: { 'user-agent': 'Mozilla/5.0 (cofre do painel Samuel Freire)', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8', ...cabecalhos },
  });
  const destino = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && destino) {
    if (!saltos) throw new Error('O link redireciona demais.');
    return baixar(new URL(destino, url).toString(), cabecalhos, saltos - 1);
  }
  if (!r.ok) throw new Error('A página respondeu ' + r.status + '.');
  // Lê no máximo 1 MB: o que importa está no começo.
  const leitor = r.body.getReader();
  const pedacos = []; let total = 0;
  while (total < 1048576) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value); total += value.length;
  }
  leitor.cancel().catch(() => {});
  return Buffer.concat(pedacos).toString('utf8');
}

const entidades = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ');

function meta(html, nome) {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nome}["'][^>]*>`, 'i'));
  return m ? entidades((m[0].match(/content=["']([^"']*)/i) || [])[1] || '') : '';
}

export async function lerPagina(url) {
  const gh = new URL(url).hostname.replace(/^www\./, '') === 'github.com' && new URL(url).pathname.match(/^\/([^/]+)\/([^/#?]+)/);
  if (gh) {
    const repo = `https://api.github.com/repos/${gh[1]}/${gh[2].replace(/\.git$/, '')}`;
    const info = JSON.parse(await baixar(repo, { accept: 'application/vnd.github+json' }).catch(() => '{}'));
    const leia = await baixar(repo + '/readme', { accept: 'application/vnd.github.raw' }).catch(() => '');
    return { titulo: info.full_name || gh[1] + '/' + gh[2], descricao: [info.description, (info.topics || []).join(', ')].filter(Boolean).join(' | '), texto: leia.slice(0, 6000) };
  }
  const html = await baixar(url, { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' });
  const texto = entidades(html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return {
    titulo: entidades((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim() || meta(html, 'og:title'),
    descricao: meta(html, 'description') || meta(html, 'og:description'),
    texto: texto.slice(0, 4000),
  };
}

/* ---------- pedir à IA ---------- */

const SISTEMA = `Você organiza o cofre pessoal de um designer brasileiro: links úteis, prompts, comandos, trechos de texto e anotações. Recebe um link (com o conteúdo lido da página) ou um texto colado, e devolve nome, descrição, categoria e tags.

- nome: curto e reconhecível. Link: o nome da ferramenta, do repositório ou do vídeo, sem slogan. Texto: um título que diga o que ele é (exemplo: "Prompt para revisar copy de landing page").
- descricao: em português do Brasil, de 2 a 4 frases simples: o que é, o que faz e quando usar. Sem jargão, sem travessão. Nunca repita o texto colado.
- categoria: uma destas chaves:
  prompts = prompt ou instrução para IA; textos = trecho, citação, anotação, roteiro, comando de terminal ou qualquer texto que não seja prompt;
  ferramentas = sites e apps; github = repositórios; videos = Instagram, YouTube, TikTok; ia = Claude, skills, produtos de IA; docs = documentação; arquivos = Drive, Figma, Notion; outros = o que não couber.
- tags: de 2 a 5 palavras curtas em minúsculas, em português quando houver termo comum.
Se a página veio vazia ou bloqueada, deduza pelo endereço e diga só o que dá para afirmar.`;

const semTravessao = (t, max) => corte(t, max).replace(/\s*[\u2014\u2013]\s*/g, ', ');

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['nome', 'descricao', 'categoria', 'tags'],
  properties: {
    nome: { type: 'string' },
    descricao: { type: 'string' },
    categoria: { type: 'string', enum: CATEGORIAS },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

async function perguntarIa(pedido) {
  let ia;
  try { ({ ia } = await pedirJsonIa([{ type: 'input_text', text: pedido }], { sistema: SISTEMA, esquema: ESQUEMA, nome: 'item_do_cofre' })); }
  catch (e) { return { erro: 'A IA não respondeu: ' + e.message }; }
  return {
    nome: semTravessao(ia.nome, 160),
    descricao: semTravessao(ia.descricao, 8000),
    categoria: CATEGORIAS.includes(ia.categoria) ? ia.categoria : 'outros',
    tags: (Array.isArray(ia.tags) ? ia.tags : []).map((t) => corte(t, 30).toLowerCase()).filter(Boolean).slice(0, 5),
  };
}

// Texto colado: a IA dá nome, explica e escolhe a categoria. Sem a
// chave, o nome é a primeira linha e vai para Prompts ou Textos.
export async function descreverTexto(textoBruto) {
  const texto = String(textoBruto || '').trim();
  if (!texto) return { erro: 'Nada para guardar.' };
  // ponytail: sem IA, prompt é reconhecido só pelo jeito de começar; a IA cobre o resto.
  const pareceprompt = /^\s*(voc[eê] [eé]|aja como|atue como|act as|you are|escreva|crie|gere|revise|resuma|analise|fa[cç]a|me ajude)/i.test(texto);
  if (!temChaveCofre()) return { nome: corte(texto.split('\n')[0], 70), categoria: pareceprompt ? 'prompts' : 'textos', semIa: true };
  return perguntarIa('Texto colado:\n"""\n' + texto.slice(0, 12000) + '\n"""');
}

export async function descrever(urlBruta) {
  let url;
  try { url = new URL(String(urlBruta || '').trim()).toString(); }
  catch (e) { return { erro: 'Cole um link completo, com https://.' }; }

  let pagina;
  try { pagina = await lerPagina(url); }
  catch (e) {
    if (/rede interna|http ou https/.test(e.message)) return { erro: e.message };
    pagina = { titulo: '', descricao: '', texto: '(não foi possível ler a página: ' + e.message + ')' };
  }

  // Sem a chave, fica o que a própria página diz de si: título e descrição.
  if (!temChaveCofre()) return { nome: corte(pagina.titulo, 160), descricao: corte(pagina.descricao.split(' | ')[0], 600), semIa: true };
  return perguntarIa(`Link: ${url}\nTítulo: ${pagina.titulo}\nDescrição da página: ${pagina.descricao}\n\nComeço do conteúdo:\n${pagina.texto}`);
}

/* ---------- separar vários itens de um material grande ----------
   Texto colado, conversa exportada (.txt ou .zip do WhatsApp), PDF,
   DOCX ou imagem. A IA devolve a lista do que vale guardar; nada é
   gravado aqui: o painel mostra para revisão e só salva o aprovado. */

const SISTEMA_SEPARAR = `Você ajuda um designer brasileiro a montar o cofre pessoal dele. Recebe um material grande (conversa, anotações, documento, print) e separa TUDO o que vale guardar, um item por coisa útil:
- links de ferramentas, repositórios, vídeos, documentações e arquivos;
- prompts e instruções para IA, copiados por inteiro;
- comandos de terminal, trechos de código e configurações, copiados por inteiro;
- dicas, decisões e informações que ele vai querer achar depois.
Ignore conversa sem conteúdo (cumprimentos, combinados de horário, "ok", "valeu").

Para cada item:
- url: o endereço exatamente como aparece no material; vazio se não houver. Nunca invente nem complete endereço.
- conteudo: para prompt, comando, código ou dica, o texto exato do material (pode juntar linhas da mesma mensagem); vazio para link puro.
- nome: curto e reconhecível, em português quando fizer sentido.
- descricao: português do Brasil, de 1 a 3 frases simples: o que é e quando usar. Sem travessão.
- categoria: prompts, textos, ferramentas, github, videos, ia, docs, arquivos ou outros (textos = comando, código, dica, anotação).
- tags: de 2 a 5 palavras curtas em minúsculas.
Junte repetições num item só. Se nada for útil, devolva a lista vazia.`;

const ESQUEMA_SEPARAR = {
  type: 'object', additionalProperties: false, required: ['itens'],
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['url', 'conteudo', 'nome', 'descricao', 'categoria', 'tags'],
        properties: {
          url: { type: 'string' },
          conteudo: { type: 'string' },
          nome: { type: 'string' },
          descricao: { type: 'string' },
          categoria: { type: 'string', enum: CATEGORIAS },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export async function separar({ texto, arquivos }) {
  if (!temChaveIa()) return { erro: 'Separar precisa da IA: falta a OPENAI_API_KEY na stack.', semChave: true };
  const t = String(texto || '').trim();
  if (!t && !(arquivos || []).length) return { erro: 'Cole um texto ou escolha um arquivo.' };

  let anexos;
  try { anexos = prepararAnexos(arquivos || []); }
  catch (e) { return { erro: e.message }; }
  const partes = [];
  if (t) partes.push({ type: 'input_text', text: '--- Material colado ---\n' + t.slice(0, 60000) });
  partes.push(...anexos.partes);
  if (!partes.length) return { erro: 'Nenhum arquivo pôde ser lido. Use texto, imagem, PDF, DOCX ou ZIP.', lidos: anexos.lidos };

  let ia;
  // ponytail: uma chamada só, até ~16 mil tokens de saída (algumas dezenas
  // de itens). Material maior que isso, mandar em partes.
  try { ({ ia } = await pedirJsonIa(partes, { sistema: SISTEMA_SEPARAR, esquema: ESQUEMA_SEPARAR, nome: 'itens_do_cofre', tokens: 16000 })); }
  catch (e) { return { erro: 'A IA não respondeu: ' + e.message, lidos: anexos.lidos }; }

  const itens = (ia.itens || []).map((i) => ({
    url: /^https?:\/\/\S+$/i.test(String(i.url || '').trim()) ? corte(i.url, 2000) : '',
    conteudo: String(i.conteudo || '').slice(0, 50000).trim(),
    nome: semTravessao(i.nome, 160),
    descricao: semTravessao(i.descricao, 8000),
    categoria: CATEGORIAS.includes(i.categoria) ? i.categoria : 'outros',
    tags: (Array.isArray(i.tags) ? i.tags : []).map((x) => corte(x, 30).toLowerCase()).filter(Boolean).slice(0, 5),
  })).filter((i) => i.nome && (i.url || i.conteudo || i.descricao));
  return { itens, lidos: anexos.lidos };
}
