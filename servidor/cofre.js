/* ============================================================
   Cofre: banco de links úteis do Samuel. Só o painel enxerga.

   Tudo num arquivo só (/dados/cofre.json): são algumas centenas de
   itens pequenos, e a busca e os filtros rodam no navegador.

   Ao guardar um link, o servidor lê a página do link (no GitHub, o
   README pela API), manda para o Claude e devolve nome, descrição,
   categoria e tags. Sem a ANTHROPIC_API_KEY, devolve só o título e a
   descrição da página. Endereço da rede interna
   (localhost, IP privado) é recusado antes de qualquer leitura.
   ============================================================ */

import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { RAIZ_DADOS } from './dados.js';

const ARQ = path.join(RAIZ_DADOS, 'cofre.json');
export const CATEGORIAS = ['ferramentas', 'github', 'videos', 'ia', 'docs', 'arquivos', 'outros'];
export const temChaveCofre = () => Boolean(process.env.ANTHROPIC_API_KEY);

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

/* ---------- pedir ao Claude ---------- */

const SISTEMA = `Você organiza um banco pessoal de links úteis de um designer brasileiro. Recebe o endereço e o conteúdo lido da página e responde SÓ com um JSON, sem nada antes ou depois:
{"nome": "...", "descricao": "...", "categoria": "...", "tags": ["..."]}

- nome: curto e reconhecível (o nome da ferramenta, do repositório ou do vídeo), sem slogan.
- descricao: em português do Brasil, de 2 a 4 frases simples: o que é, o que faz e quando usar. Sem jargão, sem travessão.
- categoria: uma destas chaves: ferramentas, github, videos, ia, docs, arquivos, outros.
  (github = repositórios; videos = Instagram, YouTube, TikTok; ia = Claude, skills, IA em geral; docs = documentação; arquivos = Drive, Figma, Notion)
- tags: de 2 a 5 palavras curtas em minúsculas, em português quando houver termo comum.
Se a página veio vazia ou bloqueada, deduza pelo endereço e diga só o que dá para afirmar.`;

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

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 800,
      system: SISTEMA,
      messages: [{ role: 'user', content: `Endereço: ${url}\nTítulo: ${pagina.titulo}\nDescrição da página: ${pagina.descricao}\n\nComeço do conteúdo:\n${pagina.texto}` }],
    }),
  }).catch((e) => ({ ok: false, json: async () => ({ error: { message: e.message } }) }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: 'A IA não respondeu: ' + (d?.error?.message || r.status) };

  const texto = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let ia;
  try { ia = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)); }
  catch (e) { return { erro: 'A IA respondeu num formato inesperado. Tente de novo.' }; }
  const semTravessao = (t) => corte(t, 8000).replace(/\s*[\u2014\u2013]\s*/g, ', ');
  return {
    nome: semTravessao(ia.nome).slice(0, 160),
    descricao: semTravessao(ia.descricao),
    categoria: CATEGORIAS.includes(ia.categoria) ? ia.categoria : 'outros',
    tags: (Array.isArray(ia.tags) ? ia.tags : []).map((t) => corte(t, 30).toLowerCase()).filter(Boolean).slice(0, 5),
  };
}
