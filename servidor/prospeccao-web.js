/* ============================================================
   Prospecção: o que a web sabe de um negócio, sem chave nenhuma.

   verificarSite   procura "nome cidade" no DuckDuckGo e separa
                   site próprio de diretório (Yelp, Páginas Amarelas,
                   Facebook). É o que corrige o "sem site" do
                   OpenStreetMap, que raramente tem o site cadastrado.
   traduzir        português para inglês por um tradutor sem chave,
                   com aviso de que é automático.

   Tudo com prazo e cache: a busca pública limita por IP e não pode
   ser chamada duas vezes para o mesmo negócio.
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RAIZ_DADOS } from './dados.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PASTA = path.join(RAIZ_DADOS, 'prospeccao');
const ARQ_CACHE = path.join(PASTA, 'verificacoes.json');
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

async function buscar(url, opcoes = {}, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opcoes, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

/* ---------- cache ---------- */
let cache = null;
async function lerCache() {
  if (cache) return cache;
  try { cache = JSON.parse(await fs.readFile(ARQ_CACHE, 'utf8')); } catch (e) { cache = {}; }
  return cache;
}
async function gravarCache() {
  await fs.mkdir(PASTA, { recursive: true });
  const tmp = ARQ_CACHE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(cache), 'utf8');
  await fs.rename(tmp, ARQ_CACHE);
}

/* ---------- diretórios e redes: não são "site próprio" ---------- */
const DIRETORIOS = /(^|\.)(yelp|yellowpages|yellowpagesdirectory|bbb|mapquest|foursquare|tripadvisor|restaurantguru|zomato|opentable|thefork|happycow|sluurpy|tupalo|nicelocal|storeboard|bizprofile|bizcommunity|houzz|angi|angieslist|thumbtack|homeadvisor|networx|buildertrend|nextdoor|alignable|manta|dnb|zoominfo|apollo|buzzfile|chamberofcommerce|superpages|citysearch|merchantcircle|opencorporates|bizapedia|cylex|hotfrog|brownbook|yext|waze|wikipedia|indeed|glassdoor|crunchbase|porch|buildzoom|homestars|houzzpro|411|whitepages|spokeo|pinterest|reddit|quora|amazon|ebay|etsy|alibaba|apple|bing|google|duckduckgo|yahoo|telelistas|apontador|guiamais|solutudo|encontraguia|jusbrasil|econodata|empresascnpj|casadosdados|cnpj\.biz|cnpja|consultacnpj|reclameaqui|ifood|rappi|ubereats|doordash|grubhub|anotaai|goomer|doctoralia|boaconsulta|getninjas|habitissimo|olx|mercadolivre|booking|airbnb|expedia|hotels|trivago|trustpilot|birdeye|sitejabber|mapcarta|cybo|kompass|europages|infobel|paginasamarillas|paginas-amarelas|paginasamarelas|hotmart|linktr\.ee|beacons\.ai)\.[a-z.]+$/i;
const REDES = /(^|\.)(facebook|instagram|fb|linkedin|tiktok|youtube|x|twitter|threads|whatsapp|wa)\.(com|me|br)$/i;

/* Ficha de diretório não é site próprio: o Yelp e as páginas
   amarelas aparecem no campo "site" do perfil e enganam a
   varredura, que marcava o negócio como atendido. */
export function ehDiretorio(url) {
  const h = hostDe(String(url || '').trim().replace(/^(?!https?:)/i, 'https://'));
  return Boolean(h) && DIRETORIOS.test(h);
}

const PARADAS = new Set(['the', 'and', 'inc', 'llc', 'ltd', 'ltda', 'corp', 'co', 'company', 'group', 'services', 'service', 'de', 'da', 'do', 'dos', 'das', 'e', 'em', 'para', 'com', 'of', 'for', 'a', 'o', 'os', 'as', 'clinica', 'clínica', 'studio', 'estudio', 'estúdio', 'shop', 'store', 'loja', 'centro', 'center', 'home', 'construction', 'remodeling', 'improvement', 'roofing', 'plumbing', 'painting', 'landscaping', 'design', 'dental', 'dentist', 'law', 'restaurant', 'auto', 'repair', 'cleaning', 'salon', 'barber', 'spa', 'fitness', 'gym']);

const simples = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
function tokensDoNome(nome) {
  return simples(nome).split(/\s+/).filter((t) => t.length >= 3 && !PARADAS.has(t) && !/^\d+$/.test(t));
}

function hostDe(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

/* Lê a página de resultados: links de resultado e seus títulos. */
function lerResultados(html) {
  const saida = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && saida.length < 12) {
    let href = m[1].replace(/&amp;/g, '&');
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch (e) { /* fica como está */ } }
    if (href.startsWith('//')) href = 'https:' + href;
    const titulo = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (/^https?:/i.test(href)) saida.push({ href, titulo });
  }
  return saida;
}

export async function verificarSite({ nome, cidade, pais }) {
  const chave = simples(nome) + '|' + simples(cidade);
  const c = await lerCache();
  const guardado = c[chave];
  if (guardado && Date.now() - guardado.quando < VALIDADE_MS) return { ...guardado, doCache: true };

  const q = `"${String(nome).trim()}" ${String(cidade || '').split(',')[0].trim()}`.trim();
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q) + (pais ? '&kl=' + { us: 'us-en', br: 'br-pt', ca: 'ca-en', gb: 'uk-en', au: 'au-en', pt: 'pt-pt', es: 'es-es', mx: 'mx-es' }[pais] || '' : '');
  let html;
  try {
    const r = await buscar(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.8,pt-BR;q=0.6' } });
    if (r.status === 202 || r.status === 403 || r.status === 429) return { estado: 'bloqueado', motivo: 'A busca pública barrou a consulta agora; tente de novo em alguns minutos.' };
    if (!r.ok) return { estado: 'erro', motivo: `A busca respondeu ${r.status}.` };
    html = await r.text();
  } catch (e) {
    return { estado: 'erro', motivo: 'A busca não respondeu a tempo.' };
  }

  const resultados = lerResultados(html);
  const tokens = tokensDoNome(nome);
  const nomeSimples = simples(nome).replace(/\s+/g, ' ').trim();
  let site = null, confianca = '';
  const redes = {};
  const diretorios = [];
  const talvez = [];   // bateu o nome no título, mas não no domínio

  for (const r of resultados) {
    const host = hostDe(r.href);
    if (!host) continue;
    const tituloS = simples(r.titulo);
    const bateTitulo = nomeSimples.length >= 6 && tituloS.includes(nomeSimples);
    const bateHost = tokens.filter((t) => host.replace(/[^a-z0-9]/g, '').includes(t)).length;

    if (REDES.test(host)) {
      if (bateTitulo || bateHost) {
        const qual = /instagram/.test(host) ? 'instagram' : /facebook|fb\./.test(host) ? 'facebook' : /linkedin/.test(host) ? 'linkedin' : /tiktok/.test(host) ? 'tiktok' : /youtube/.test(host) ? 'youtube' : 'x';
        if (!redes[qual]) redes[qual] = r.href;
      }
      continue;
    }
    if (DIRETORIOS.test(host)) { if (bateTitulo || bateHost) diretorios.push(host); continue; }
    // Site próprio é o domínio que carrega o nome do negócio. Título
    // batendo sozinho não vale: era assim que um diretório novo, fora
    // da lista, entrava como se fosse o site da pessoa.
    if (bateHost >= 2 || (bateHost === 1 && tokens.length <= 2)) { if (!site) { site = r.href; confianca = 'alta'; } }
    else if (bateHost === 1) { if (!site) { site = r.href; confianca = 'media'; } }
    else if (bateTitulo && talvez.length < 3) talvez.push(r.href);
  }

  const saida = {
    estado: site ? 'site' : Object.keys(redes).length ? 'rede' : 'nada',
    site: site || undefined,
    confianca: site ? confianca : undefined,
    redes,
    talvez: site ? [] : talvez,
    diretorios: [...new Set(diretorios)].slice(0, 4),
    consulta: q,
    quando: Date.now(),
  };
  c[chave] = saida;
  gravarCache().catch(() => {});
  return saida;
}

/* ---------- tradução ---------- */

async function traduzirGoogle(texto, de, para) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${de}&tl=${para}&dt=t&q=${encodeURIComponent(texto)}`;
  const r = await buscar(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error('gtx ' + r.status);
  const d = await r.json();
  const partes = Array.isArray(d?.[0]) ? d[0].map((x) => x?.[0] || '') : [];
  const t = partes.join('');
  if (!t.trim()) throw new Error('gtx vazio');
  return t;
}

async function traduzirMyMemory(texto, de, para) {
  const blocos = texto.split(/\n{2,}/);
  const saida = [];
  for (const b of blocos) {
    if (!b.trim()) { saida.push(''); continue; }
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(b.slice(0, 480))}&langpair=${de}|${para}`;
    const r = await buscar(url);
    if (!r.ok) throw new Error('mymemory ' + r.status);
    const d = await r.json();
    const t = d?.responseData?.translatedText;
    if (!t) throw new Error('mymemory vazio');
    saida.push(t);
  }
  return saida.join('\n\n');
}

export async function traduzir(texto, de = 'pt', para = 'en') {
  const t = String(texto || '').slice(0, 4000);
  if (!t.trim()) return { erro: 'Nada para traduzir.' };
  try { return { texto: await traduzirGoogle(t, de, para), por: 'google' }; }
  catch (e) { /* cai no próximo */ }
  try { return { texto: await traduzirMyMemory(t, de, para), por: 'mymemory' }; }
  catch (e) { return { erro: 'Nenhum tradutor respondeu agora. Tente de novo em instantes.' }; }
}
