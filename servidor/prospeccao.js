/* ============================================================
   Prospecção — "encontre quem precisa de você antes de mandar
   mensagem". A versão do MIRA que cabe neste servidor: sem
   Supabase, sem créditos, sem cadastro. Quem usa é quem tem a
   senha do painel; leads e perfil ficam no volume, em JSON.

   Rotas (todas atrás da tranca do /api):
     GET  /api/prospeccao/config              o que está ligado (chaves na stack)
     GET  /api/prospeccao/cidades?pais&q      autocomplete de cidade (Nominatim)
     GET  /api/prospeccao/buscar?…            varredura de negócios
     GET  /api/prospeccao/site?url            diagnóstico rápido do site
     POST /api/prospeccao/mensagem            mensagem escrita pelo Claude
     GET  /api/prospeccao/instagram?termo&cidade  perfis via Serper
     GET  /api/prospeccao/vagas?termo         vagas remotas de design
     GET/PUT /api/prospeccao/perfil           quem assina as mensagens
     GET/POST /api/prospeccao/leads           minha lista
     PUT/DELETE /api/prospeccao/leads/<id>

   Chaves, todas opcionais, na stack:
     GOOGLE_PLACES_KEY   sem ela a busca cai no OpenStreetMap
                         (Overpass) — funciona, mas sem nota nem
                         avaliações
     ANTHROPIC_API_KEY   sem ela só os templates locais escrevem
     SERPER_API_KEY      sem ela a busca de perfis fica desligada
     PAGESPEED_KEY       o navegador chama o PageSpeed direto; a
                         chave só aumenta a cota
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RAIZ_DADOS } from './dados.js';
import { diagnosticar, normalizarUrl } from './prospeccao-site.js';

const PASTA = path.join(RAIZ_DADOS, 'prospeccao');
const ARQ_LEADS = path.join(PASTA, 'leads.json');
const ARQ_PERFIL = path.join(PASTA, 'perfil.json');

const UA = 'links.samuelfreire.com.br/google-prospection (prospeccao; contato: samuelfreirebr@gmail.com)';

const chaveGoogle = () => process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const chaveClaude = () => process.env.ANTHROPIC_API_KEY || '';
const chaveSerper = () => process.env.SERPER_API_KEY || '';
const chavePageSpeed = () => process.env.PAGESPEED_KEY || '';

/* ---------- respostas ---------- */

const json = (res, dado, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dado));
};

async function lerCorpoJson(req, limite = 256 * 1024) {
  const pedacos = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) throw new Error('grande');
    pedacos.push(p);
  }
  const bruto = Buffer.concat(pedacos).toString('utf8');
  return bruto ? JSON.parse(bruto) : {};
}

// fetch com prazo: nenhuma fonte externa pode segurar uma requisição pra sempre.
async function buscar(url, opcoes = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opcoes, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

/* ---------- nichos e países ---------- */

/* Cada nicho carrega o termo que vai pro Google (na língua do país)
   e a tag do OpenStreetMap (para quando não há chave do Google). */
export const NICHOS = [
  { id: 'dentista',      pt: 'Dentista',            en: 'Dentist',              es: 'Dentista',            osm: ['amenity', 'dentist'] },
  { id: 'nutricionista', pt: 'Nutricionista',       en: 'Nutritionist',         es: 'Nutricionista',       osm: ['healthcare', 'nutrition_counselling'] },
  { id: 'estetica',      pt: 'Estética e beleza',   en: 'Beauty clinic',        es: 'Clínica de estética', osm: ['shop', 'beauty'] },
  { id: 'fisioterapia',  pt: 'Fisioterapia',        en: 'Physiotherapist',      es: 'Fisioterapeuta',      osm: ['healthcare', 'physiotherapist'] },
  { id: 'psicologia',    pt: 'Psicologia',          en: 'Psychologist',         es: 'Psicólogo',           osm: ['healthcare', 'psychotherapist'] },
  { id: 'veterinaria',   pt: 'Veterinária',         en: 'Veterinarian',         es: 'Veterinario',         osm: ['amenity', 'veterinary'] },
  { id: 'advocacia',     pt: 'Advocacia',           en: 'Law firm',             es: 'Abogado',             osm: ['office', 'lawyer'] },
  { id: 'contabilidade', pt: 'Contabilidade',       en: 'Accountant',           es: 'Contador',            osm: ['office', 'accountant'] },
  { id: 'imobiliaria',   pt: 'Imobiliária',         en: 'Real estate agency',   es: 'Inmobiliaria',        osm: ['office', 'estate_agent'] },
  { id: 'academia',      pt: 'Academia',            en: 'Gym',                  es: 'Gimnasio',            osm: ['leisure', 'fitness_centre'] },
  { id: 'salao',         pt: 'Salão e barbearia',   en: 'Hair salon',           es: 'Peluquería',          osm: ['shop', 'hairdresser'] },
  { id: 'restaurante',   pt: 'Restaurante',         en: 'Restaurant',           es: 'Restaurante',         osm: ['amenity', 'restaurant'] },
  { id: 'clinica',       pt: 'Clínica médica',      en: 'Medical clinic',       es: 'Clínica médica',      osm: ['amenity', 'clinic'] },
  { id: 'petshop',       pt: 'Pet shop',            en: 'Pet shop',             es: 'Tienda de mascotas',  osm: ['shop', 'pet'] },
  { id: 'concessionaria',pt: 'Concessionária',      en: 'Car dealership',       es: 'Concesionario',       osm: ['shop', 'car'] },
  { id: 'oficina',       pt: 'Oficina mecânica',    en: 'Auto repair shop',     es: 'Taller mecánico',     osm: ['shop', 'car_repair'] },
  { id: 'hamburgueria',  pt: 'Hamburgueria',        en: 'Burger restaurant',    es: 'Hamburguesería',      osm: ['amenity', 'fast_food'] },
];

export const PAISES = [
  ['br', 'Brasil'], ['us', 'Estados Unidos'], ['ca', 'Canadá'], ['gb', 'Reino Unido'], ['ie', 'Irlanda'],
  ['au', 'Austrália'], ['nz', 'Nova Zelândia'], ['pt', 'Portugal'], ['es', 'Espanha'], ['mx', 'México'],
  ['ar', 'Argentina'], ['cl', 'Chile'], ['co', 'Colômbia'], ['de', 'Alemanha'], ['fr', 'França'],
  ['it', 'Itália'], ['nl', 'Holanda'], ['ae', 'Emirados Árabes'],
];
const PAIS_OK = new Set(PAISES.map(([c]) => c));

const linguaDe = (pais) => ({ br: 'pt', pt: 'pt', es: 'es', mx: 'es', ar: 'es', cl: 'es', co: 'es' }[pais] || 'en');
const codigoLingua = (pais) => ({ br: 'pt-BR', pt: 'pt-PT', es: 'es', mx: 'es-419', ar: 'es-419', cl: 'es-419', co: 'es-419', de: 'de', fr: 'fr', it: 'it', nl: 'nl' }[pais] || 'en');

// Modo "Brasil inteiro": as dez maiores capitais, uma página cada.
const CAPITAIS = [
  ['São Paulo, SP', -23.5505, -46.6333], ['Rio de Janeiro, RJ', -22.9068, -43.1729], ['Brasília, DF', -15.7939, -47.8828],
  ['Salvador, BA', -12.9714, -38.5124], ['Fortaleza, CE', -3.7319, -38.5267], ['Belo Horizonte, MG', -19.9167, -43.9345],
  ['Manaus, AM', -3.1190, -60.0217], ['Curitiba, PR', -25.4284, -49.2733], ['Recife, PE', -8.0476, -34.8770], ['Porto Alegre, RS', -30.0346, -51.2177],
];

/* ---------- geocodificação (Nominatim) ---------- */

async function cidades(pais, q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', q);
  url.searchParams.set('countrycodes', pais);
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', codigoLingua(pais));
  const r = await buscar(url, { headers: { 'user-agent': UA } }, 8000);
  if (!r.ok) throw new Error('Nominatim ' + r.status);
  const lista = await r.json();
  const vistos = new Set();
  const saida = [];
  for (const x of lista) {
    const tipo = x.addresstype || x.type || '';
    if (!/city|town|village|municipality|suburb|county|state_district|administrative|hamlet|borough|quarter|neighbourhood|locality/.test(tipo)) continue;
    const a = x.address || {};
    const nome = x.name || a.city || a.town || a.village || a.municipality || '';
    if (!nome) continue;
    const estado = pais === 'br' ? (a['ISO3166-2-lvl4'] || '').replace('BR-', '') : (a.state || a.county || a.region || '');
    const rotulo = estado && estado !== nome ? `${nome}, ${estado}` : nome;
    if (vistos.has(rotulo)) continue;
    vistos.add(rotulo);
    saida.push({ rotulo, lat: Number(x.lat), lon: Number(x.lon) });
  }
  return saida;
}

async function geocodificar(cidade, pais) {
  const lista = await cidades(pais, cidade).catch(() => []);
  return lista[0] || null;
}

async function nomeDoLugar(lat, lon, pais) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat); url.searchParams.set('lon', lon);
    url.searchParams.set('zoom', '10');
    url.searchParams.set('accept-language', codigoLingua(pais));
    const r = await buscar(url, { headers: { 'user-agent': UA } }, 6000);
    const d = await r.json();
    const a = d.address || {};
    const nome = a.city || a.town || a.village || a.municipality || d.name || '';
    const estado = pais === 'br' ? (a['ISO3166-2-lvl4'] || '').replace('BR-', '') : (a.state || '');
    return nome ? (estado ? `${nome}, ${estado}` : nome) : 'perto de você';
  } catch (e) { return 'perto de você'; }
}

/* ---------- classificação e pontuação ---------- */

const REDES = /(^|\.)(instagram\.com|facebook\.com|fb\.com|m\.me|linkedin\.com|wa\.me|whatsapp\.com|linktr\.ee|beacons\.ai|bio\.site|t\.me|youtube\.com|tiktok\.com|x\.com|twitter\.com|ifood\.com\.br|goomer\.app|anota\.ai)$/i;

function classificar(n) {
  let site = n.site ? String(n.site).trim() : '';
  let insta = n.insta || '';
  if (site) {
    try {
      const host = new URL(/^https?:/i.test(site) ? site : 'https://' + site).hostname;
      if (REDES.test(host)) { insta = site; site = ''; }
    } catch (e) { site = ''; }
  }
  n.site = site || undefined;
  n.insta = insta || undefined;
  n.semSite = !site;
  n.soRede = !site && Boolean(insta);
  n.semNada = !site && !insta;
  return n;
}

/* Quem não tem site é a venda mais fácil: começa em 70. Quem tem site
   sobe com o movimento (avaliações) — já atende e fatura, então pode
   pagar — e o diagnóstico do site, feito depois no navegador, ajusta. */
function pontuar(n) {
  const av = Number(n.avaliacoes) || 0;
  const nota = Number(n.nota) || 0;
  if (n.semSite) {
    let s = 70;
    if (av >= 40) s += 6;
    if (av >= 150) s += 6;
    if (n.fone) s += 4;
    if (nota >= 4.5) s += 3;
    if (n.semNada) s += 2;
    return Math.min(100, s);
  }
  let s = 29 + 4 * ((nota || 4.5) - 4.5) + Math.sqrt(av);
  if (n.fone) s += 2;
  return Math.max(15, Math.min(64, Math.round(s)));
}

const chaveDe = (n) => (String(n.nome || '') + '|' + String(n.end || '')).toLowerCase().slice(0, 180);

function fechar(lista, lugar, extra = {}) {
  const vistos = new Set();
  const limpa = [];
  for (const n of lista) {
    if (!n.nome) continue;
    const k = chaveDe(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    classificar(n);
    n.score = pontuar(n);
    limpa.push(n);
  }
  limpa.sort((a, b) => b.score - a.score || (b.avaliacoes || 0) - (a.avaliacoes || 0));
  return {
    lugar: { nome: lugar },
    total: limpa.length,
    semSite: limpa.filter((x) => x.semSite).length,
    comFone: limpa.filter((x) => x.fone).length,
    lista: limpa,
    ...extra,
  };
}

/* ---------- Google Places (New) ---------- */

const MASCARA = [
  'nextPageToken', 'places.id', 'places.displayName', 'places.formattedAddress',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.rating', 'places.userRatingCount', 'places.reviews', 'places.primaryTypeDisplayName',
  'places.googleMapsUri',
].join(',');

// Caixa em graus a partir do raio em metros (1° de latitude ≈ 111 km).
function caixa(lat, lon, raio) {
  const dLat = raio / 111000;
  const dLon = raio / (111000 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return { low: { latitude: lat - dLat, longitude: lon - dLon }, high: { latitude: lat + dLat, longitude: lon + dLon } };
}

async function paginaGoogle(corpo) {
  const r = await buscar('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': chaveGoogle(), 'x-goog-fieldmask': MASCARA },
    body: JSON.stringify(corpo),
  }, 20000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || ('Google respondeu ' + r.status));
  return d;
}

async function buscarGoogle({ termo, lat, lon, raio, pais, paginas = 3 }) {
  const corpo = {
    textQuery: termo,
    languageCode: codigoLingua(pais),
    regionCode: pais.toUpperCase(),
    pageSize: 20,
    locationRestriction: { rectangle: caixa(lat, lon, raio) },
  };
  const saida = [];
  let token = null;
  for (let i = 0; i < paginas; i++) {
    const d = await paginaGoogle(token ? { ...corpo, pageToken: token } : corpo);
    for (const p of d.places || []) {
      saida.push({
        nome: p.displayName?.text || '',
        end: p.formattedAddress || '',
        fone: p.nationalPhoneNumber || undefined,
        foneIntl: p.internationalPhoneNumber ? p.internationalPhoneNumber.replace(/\D/g, '') : undefined,
        site: p.websiteUri || undefined,
        nota: p.rating || undefined,
        avaliacoes: p.userRatingCount || undefined,
        opinioes: (p.reviews || []).map((r) => r.text?.text || r.originalText?.text || '').filter(Boolean).map((t) => t.slice(0, 280)).slice(0, 4),
        tipo: p.primaryTypeDisplayName?.text || undefined,
        maps: p.googleMapsUri || undefined,
      });
    }
    token = d.nextPageToken;
    if (!token) break;
  }
  return saida;
}

/* ---------- OpenStreetMap (Overpass) — sem chave ---------- */

async function buscarOsm({ nicho, termo, lat, lon, raio }) {
  const filtro = nicho?.osm
    ? `["${nicho.osm[0]}"="${nicho.osm[1]}"]`
    : `["name"~"${String(termo).replace(/["\\]/g, '')}",i]`;
  const q = `[out:json][timeout:25];nwr${filtro}(around:${Math.round(raio)},${lat},${lon});out center tags 120;`;
  const r = await buscar('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: 'data=' + encodeURIComponent(q),
  }, 30000);
  if (!r.ok) throw new Error('OpenStreetMap respondeu ' + r.status);
  const d = await r.json();
  return (d.elements || []).map((e) => {
    const t = e.tags || {};
    const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
    const bairro = t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:district'] || '';
    const cidade = t['addr:city'] || '';
    const end = [rua, bairro, cidade].filter(Boolean).join(' - ') || (t['addr:full'] || '');
    const fone = t.phone || t['contact:phone'] || t['contact:whatsapp'] || t['contact:mobile'] || undefined;
    // O OSM guarda a rede ora como link, ora como arroba: vira link sempre.
    const rede = (v, base) => v ? (/^https?:/i.test(v) ? v : base + String(v).replace(/^@/, '').replace(/\/+$/, '') + '/') : undefined;
    const insta = rede(t['contact:instagram'], 'https://www.instagram.com/') || rede(t['contact:facebook'], 'https://www.facebook.com/');
    return {
      nome: t.name || '',
      end,
      fone,
      foneIntl: fone ? fone.replace(/\D/g, '') : undefined,
      site: t.website || t['contact:website'] || undefined,
      insta,
      tipo: t.cuisine || t.healthcare || t.shop || t.amenity || undefined,
      maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((t.name || '') + ' ' + end)}`,
    };
  });
}

/* ---------- a varredura ---------- */

async function varrer(url) {
  const p = url.searchParams;
  const pais = PAIS_OK.has(p.get('pais')) ? p.get('pais') : 'br';
  const lingua = linguaDe(pais);
  const nicho = NICHOS.find((n) => n.id === p.get('nicho')) || null;
  const termoLivre = String(p.get('termo') || '').trim().slice(0, 60);
  if (!nicho && !termoLivre) return { erro: 'Escolha um nicho ou escreva um.' };
  const termo = nicho ? (nicho[lingua] || nicho.en) : termoLivre;
  const raio = Math.min(30000, Math.max(2000, Number(p.get('raio')) || 12000));
  const modo = p.get('modo') || 'cidade';
  const usaGoogle = Boolean(chaveGoogle());
  const fonte = usaGoogle ? 'google' : 'osm';

  const buscarEm = (lat, lon, r, paginas) => usaGoogle
    ? buscarGoogle({ termo, lat, lon, raio: r, pais, paginas })
    : buscarOsm({ nicho: nicho || null, termo, lat, lon, raio: r });

  if (modo === 'brasil') {
    const partes = [];
    // Três praças por vez: o Overpass barra mais que isso, e o Google não precisa de mais.
    for (let i = 0; i < CAPITAIS.length; i += 3) {
      const fatia = CAPITAIS.slice(i, i + 3);
      const res = await Promise.allSettled(fatia.map(([nome, lat, lon]) => buscarEm(lat, lon, 12000, 1).then((l) => l.map((x) => ({ ...x, praca: nome })))));
      for (const r of res) if (r.status === 'fulfilled') partes.push(...r.value);
    }
    return fechar(partes, 'Brasil — 10 capitais', { pracas: CAPITAIS.length, fonte, termo });
  }

  let lat = Number(p.get('lat')), lon = Number(p.get('lon'));
  let lugar = String(p.get('cidade') || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (!lugar) return { erro: 'Informe a cidade.' };
    const g = await geocodificar(lugar, pais);
    if (!g) return { erro: `Não achei "${lugar}". Escolha uma cidade da lista.` };
    lat = g.lat; lon = g.lon; lugar = g.rotulo;
  } else if (!lugar) {
    lugar = await nomeDoLugar(lat, lon, pais);
  }

  const lista = await buscarEm(lat, lon, raio, 3);
  return fechar(lista, lugar, { fonte, termo, lat, lon, raio });
}

/* ---------- mensagem com Claude ---------- */

const SISTEMA_PT = `Você escreve mensagens curtas de primeiro contato para um designer que vende sites e páginas para negócios locais. A mensagem vai por WhatsApp para o dono do negócio, que nunca ouviu falar do designer.

Estrutura obrigatória, nesta ordem, sem títulos:
1. O que eu vi — um detalhe concreto e verificável do negócio (nome como a vizinhança chama, bairro, avaliações, o que falta ou o que está errado no site).
2. O que isso custa — em uma frase, o cliente que ele perde por causa disso. Sem catastrofismo.
3. O que eu já fiz — o designer já preparou algo (uma página, uma primeira tela) e vai mandar. Entrega antes da oferta.
4. Fecho sem pedir permissão — ele manda o link ainda hoje; não pergunta "posso?".

Regras: até 90 palavras. Tom de gente, direto, sem "espero que esteja bem", sem "gostaria de apresentar", sem lista, sem emoji, sem hashtag. Uma saudação curta no começo. Assina com o primeiro nome do designer no fim. Não invente números que não estão nos dados. Quando houver opiniões de clientes, use uma expressão real delas, curta, entre aspas. Responda só com a mensagem.`;

const SISTEMA_EN = `You write short first-contact emails for a designer who sells websites and landing pages to local businesses. The recipient is the business owner, who has never heard of the designer.

Required structure, in this order, no headings:
1. What I saw — one concrete, verifiable detail about the business (how locals call it, neighborhood, reviews, what's missing or broken on the site).
2. What it costs — one sentence about the customer they lose because of it. No drama.
3. What I already did — the designer has already prepared something (a page, a first screen) and will send it. Delivery before the offer.
4. Close without asking permission — they'll send the link today; never ask "may I?".

Rules: 100 words max. Start with a subject line ("Subject: …"), then a short greeting. Human, direct; no "hope this finds you well", no bullet lists, no emoji. Sign with the designer's first name. Don't invent numbers not present in the data. If customer reviews are given, quote one short real expression from them. Reply with the email only.`;

async function mensagemIa(dado) {
  if (!chaveClaude()) return { semChave: true };
  const idioma = dado.idioma === 'en' ? 'en' : 'pt';
  const contexto = {
    negocio: dado.nome, categoria: dado.tipo || dado.nicho, bairro: dado.bairro, cidade: dado.cidade,
    nota: dado.nota, avaliacoes: dado.avaliacoes,
    site: dado.site || null,
    soRedeSocial: Boolean(dado.rede),
    problemasDoSite: (dado.problemas || []).slice(0, 6),
    opinioesDeClientes: (dado.opinioes || []).slice(0, 4),
    designer: { nome: dado.euNome, oQueFaz: dado.euFaz, cidade: dado.euCidade },
    variacao: Number(dado.variacao) || 1,
  };
  const pedido = idioma === 'en'
    ? `Business data (JSON):\n${JSON.stringify(contexto, null, 2)}\n\nWrite variation #${contexto.variacao} — a different angle from the previous ones.`
    : `Dados do negócio (JSON):\n${JSON.stringify(contexto, null, 2)}\n\nEscreva a variação nº ${contexto.variacao} — um ângulo diferente das anteriores.`;

  const r = await buscar('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chaveClaude(),
      'anthropic-version': '2023-06-01',
      // Se um classificador barrar o pedido, o próprio servidor da
      // Anthropic reencaminha para outro modelo em vez de devolver recusa.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      fallbacks: 'default',
      max_tokens: 1024,
      output_config: { effort: 'medium' },
      system: idioma === 'en' ? SISTEMA_EN : SISTEMA_PT,
      messages: [{ role: 'user', content: pedido }],
    }),
  }, 90000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || ('Claude respondeu ' + r.status));
  if (d.stop_reason === 'refusal') throw new Error('O modelo recusou escrever esta mensagem.');
  const texto = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!texto) throw new Error('Veio uma resposta vazia.');
  return { texto };
}

/* ---------- Instagram via Serper ---------- */

function lerSeguidores(s) {
  const m = String(s || '').match(/([\d.,]+)\s*([kKmM]|mil|mi|milhões|million)?\s*(followers|seguidores)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) n = parseFloat(m[1].replace(',', ''));
  const suf = (m[2] || '').toLowerCase();
  if (suf === 'k' || suf === 'mil') n *= 1000;
  if (suf === 'm' || suf === 'mi' || suf.startsWith('milh') || suf === 'million') n *= 1000000;
  return Math.round(n);
}

function faixaDe(seg, bio) {
  const porques = [];
  const b = (bio || '').toLowerCase();
  let pontos = 0;
  if (seg == null) porques.push('não mostra seguidores');
  else if (seg < 300) { porques.push('público muito pequeno'); pontos -= 2; }
  else if (seg > 150000) { porques.push('grande demais, tem time'); pontos -= 2; }
  else if (seg >= 1500) { porques.push('já tem audiência'); pontos += 1; }
  if (/agend|whatsapp|orçamento|orcamento|atendimento|consult|book|appointment|📍|horário/.test(b)) { porques.push('já atende e cobra'); pontos += 2; }
  if (/\b(cro|crm|crp|oab|crn|cref|crefito|crmv|crc)\b/i.test(b)) { porques.push('profissional registrado'); pontos += 2; }
  if (/link|site|\.com|bio\.site|linktr/.test(b)) { porques.push('já manda pra um link'); pontos += 0; }
  if (/loja|delivery|entrega|pedido/.test(b)) { porques.push('vende produto'); pontos += 1; }
  if (!porques.some((x) => /atende|registrado|vende|audiência/.test(x))) porques.push('sem sinal claro de que vende');
  const faixa = pontos >= 2 ? 'no ponto' : pontos >= 0 ? 'talvez' : 'não vale';
  return { faixa, porques };
}

async function instagram(termo, cidade) {
  if (!chaveSerper()) return { semChave: true, total: 0, comSeguidores: 0, lista: [] };
  const q = `site:instagram.com ${termo} ${cidade}`.trim();
  const r = await buscar('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': chaveSerper() },
    body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 40 }),
  }, 15000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || ('Serper respondeu ' + r.status));
  const lista = [];
  const vistos = new Set();
  for (const o of d.organic || []) {
    const m = String(o.link || '').match(/instagram\.com\/([A-Za-z0-9_.]{2,40})\/?(\?|$)/);
    if (!m) continue;
    const arroba = m[1].toLowerCase();
    if (['p', 'reel', 'reels', 'explore', 'stories', 'accounts'].includes(arroba) || vistos.has(arroba)) continue;
    vistos.add(arroba);
    const titulo = String(o.title || '');
    const nome = titulo.replace(/\s*\(@[^)]+\).*$/, '').replace(/\s*[•|·-]\s*Instagram.*$/i, '').trim() || arroba;
    const snippet = String(o.snippet || '');
    const seguidores = lerSeguidores(snippet);
    const bio = snippet.replace(/^.*?(followers|seguidores)[^-–]*[-–]\s*/i, '').replace(/See Instagram photos.*$/i, '').replace(/Veja (as )?fotos.*$/i, '').trim();
    const { faixa, porques } = faixaDe(seguidores, bio + ' ' + titulo);
    lista.push({ nome, arroba, seguidores, bio, link: `https://www.instagram.com/${arroba}/`, faixa, porques });
  }
  const ordem = { 'no ponto': 0, talvez: 1, 'não vale': 2 };
  lista.sort((a, b) => ordem[a.faixa] - ordem[b.faixa] || (b.seguidores || 0) - (a.seguidores || 0));
  return { total: lista.length, comSeguidores: lista.filter((x) => x.seguidores != null).length, lista };
}

/* ---------- vagas ---------- */

const DESIGN = /design|designer|ux|ui\b|product design|figma|webflow|framer|brand|visual|graphic|motion|creative|illustrat/i;

const tira = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const resumo = (s) => tira(s).slice(0, 220);
const dataIso = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

async function vagasRemotive(termo) {
  const url = new URL('https://remotive.com/api/remote-jobs');
  url.searchParams.set('category', 'design');
  if (termo) url.searchParams.set('search', termo);
  const d = await (await buscar(url, { headers: { 'user-agent': UA } }, 12000)).json();
  return (d.jobs || []).map((j) => ({
    cargo: j.title, empresa: j.company_name, local: j.candidate_required_location || 'Remoto',
    salario: j.salary || '', data: dataIso(j.publication_date), link: j.url, resumo: resumo(j.description),
    fonte: 'Remotive', remoto: true,
  }));
}

async function vagasRemoteOk(termo) {
  const d = await (await buscar('https://remoteok.com/api?tags=design', { headers: { 'user-agent': UA, accept: 'application/json' } }, 12000)).json();
  const t = (termo || '').toLowerCase();
  return (Array.isArray(d) ? d : []).filter((j) => j && j.position).filter((j) => !t || (j.position + ' ' + (j.tags || []).join(' ')).toLowerCase().includes(t)).map((j) => ({
    cargo: j.position, empresa: j.company, local: j.location || 'Remoto',
    salario: j.salary_min && j.salary_max ? `$${j.salary_min}–${j.salary_max}` : '',
    data: dataIso(j.date), link: j.url, resumo: resumo(j.description), fonte: 'RemoteOK', remoto: true,
  }));
}

async function vagasWwr(termo) {
  const xml = await (await buscar('https://weworkremotely.com/categories/remote-design-jobs.rss', { headers: { 'user-agent': UA } }, 12000)).text();
  const itens = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const campo = (s, n) => { const m = s.match(new RegExp('<' + n + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + n + '>')); return m ? m[1].trim() : ''; };
  const t = (termo || '').toLowerCase();
  return itens.map((s) => {
    const titulo = tira(campo(s, 'title'));
    const [empresa, ...resto] = titulo.split(': ');
    return {
      cargo: resto.length ? resto.join(': ') : titulo, empresa: resto.length ? empresa : '',
      local: tira(campo(s, 'region')) || 'Remoto', salario: '',
      data: dataIso(campo(s, 'pubDate')), link: campo(s, 'link'), resumo: resumo(campo(s, 'description')),
      fonte: 'WeWorkRemotely', remoto: true,
    };
  }).filter((j) => !t || j.cargo.toLowerCase().includes(t));
}

async function vagasHimalayas(termo) {
  const url = new URL('https://himalayas.app/jobs/api');
  url.searchParams.set('limit', '100');
  url.searchParams.set('q', termo || 'designer');
  const d = await (await buscar(url, { headers: { 'user-agent': UA } }, 12000)).json();
  return (d.jobs || []).map((j) => ({
    cargo: j.title, empresa: j.companyName, local: (j.locationRestrictions || []).join(', ') || 'Remoto',
    salario: j.minSalary && j.maxSalary ? `$${j.minSalary}–${j.maxSalary}` : '',
    data: dataIso(j.pubDate ? j.pubDate * 1000 : j.publishedDate), link: j.applicationLink, resumo: resumo(j.excerpt || j.description),
    fonte: 'Himalayas', remoto: true,
  }));
}

async function vagas(termo) {
  const fontes = [vagasRemotive, vagasRemoteOk, vagasWwr, vagasHimalayas];
  const res = await Promise.allSettled(fontes.map((f) => f(termo)));
  const vistos = new Set();
  const lista = [];
  const ativas = [];
  res.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    ativas.push(['Remotive', 'RemoteOK', 'WeWorkRemotely', 'Himalayas'][i]);
    for (const v of r.value) {
      if (!v.cargo || !DESIGN.test(v.cargo + ' ' + (v.resumo || ''))) continue;
      const k = (v.cargo + '|' + v.empresa).toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      lista.push(v);
    }
  });
  lista.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return { total: lista.length, comSalario: lista.filter((v) => v.salario).length, fontes: ativas, lista };
}

/* ---------- perfil e leads (no volume) ---------- */

let cacheLeads = null;
let cachePerfil = null;

async function gravarJson(destino, dado) {
  await fs.mkdir(PASTA, { recursive: true });
  const tmp = destino + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(dado, null, 2), 'utf8');
  await fs.rename(tmp, destino);
}

async function lerPerfil() {
  if (cachePerfil) return cachePerfil;
  try { cachePerfil = JSON.parse(await fs.readFile(ARQ_PERFIL, 'utf8')); }
  catch (e) { cachePerfil = { nome: 'Samuel Freire', faz: 'sites', cidade: '', zap: '' }; }
  return cachePerfil;
}

async function gravarPerfil(p) {
  const limpo = {
    nome: String(p.nome || '').slice(0, 80),
    faz: String(p.faz || 'sites').slice(0, 40),
    cidade: String(p.cidade || '').slice(0, 80),
    zap: String(p.zap || '').slice(0, 30),
  };
  await gravarJson(ARQ_PERFIL, limpo);
  cachePerfil = limpo;
  return limpo;
}

const ESTADOS = ['mira', 'abordado', 'respondeu', 'proposta', 'fechado', 'descartado'];

async function lerLeads() {
  if (cacheLeads) return cacheLeads;
  try { cacheLeads = JSON.parse(await fs.readFile(ARQ_LEADS, 'utf8')); }
  catch (e) { cacheLeads = []; }
  if (!Array.isArray(cacheLeads)) cacheLeads = [];
  return cacheLeads;
}

async function salvarLeads(lista) {
  cacheLeads = lista;
  await gravarJson(ARQ_LEADS, lista);
}

function limparLead(l) {
  const s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
  return {
    chave: s(l.chave, 180), nome: s(l.nome, 120), endereco: s(l.endereco, 200), fone: s(l.fone, 40), foneIntl: s(l.foneIntl, 20),
    site: s(l.site, 300), insta: s(l.insta, 300), maps: s(l.maps, 400),
    nota: Number(l.nota) || null, avaliacoes: Number(l.avaliacoes) || null, score: Number(l.score) || null,
    cidade: s(l.cidade, 80), pais: s(l.pais, 2) || 'br', origem: s(l.origem, 20) || 'mapa',
    situacao: s(l.situacao, 60),
  };
}

async function criarLead(bruto) {
  const leads = await lerLeads();
  const l = limparLead(bruto);
  if (!l.nome) throw new Error('Lead sem nome.');
  if (!l.chave) l.chave = (l.nome + '|' + l.endereco).toLowerCase().slice(0, 180);
  const existente = leads.find((x) => x.chave === l.chave);
  if (existente) return { lead: existente, jaExistia: true };
  const agora = new Date().toISOString();
  const novo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...l, estado: 'mira', anotacao: '', ultimo_toque: null, criado_em: agora, alterado_em: agora };
  leads.unshift(novo);
  await salvarLeads(leads);
  return { lead: novo };
}

async function alterarLead(id, mudancas) {
  const leads = await lerLeads();
  const l = leads.find((x) => x.id === id);
  if (!l) return null;
  if (mudancas.estado !== undefined) {
    if (!ESTADOS.includes(mudancas.estado)) throw new Error('Estado inválido.');
    if (mudancas.estado !== l.estado && mudancas.estado !== 'mira' && mudancas.estado !== 'descartado' && !l.ultimo_toque) l.ultimo_toque = new Date().toISOString();
    if (mudancas.estado === 'abordado' && l.estado !== 'abordado') l.ultimo_toque = new Date().toISOString();
    l.estado = mudancas.estado;
  }
  if (mudancas.anotacao !== undefined) l.anotacao = String(mudancas.anotacao).slice(0, 4000);
  if (mudancas.ultimo_toque !== undefined) l.ultimo_toque = mudancas.ultimo_toque ? new Date(mudancas.ultimo_toque).toISOString() : null;
  l.alterado_em = new Date().toISOString();
  await salvarLeads(leads);
  return l;
}

async function apagarLead(id) {
  const leads = await lerLeads();
  const i = leads.findIndex((x) => x.id === id);
  if (i < 0) return false;
  leads.splice(i, 1);
  await salvarLeads(leads);
  return true;
}

/* ---------- o roteador ---------- */

export function configuracao() {
  return {
    mapas: chaveGoogle() ? 'google' : 'osm',
    ia: Boolean(chaveClaude()),
    instagram: Boolean(chaveSerper()),
    pagespeedKey: chavePageSpeed(),
    nichos: NICHOS.map(({ id, pt, en }) => ({ id, pt, en })),
    paises: PAISES,
  };
}

export async function apiProspeccao(req, res, url, rota) {
  const m = req.method;
  try {
    if (rota === 'config' && m === 'GET') return json(res, configuracao());

    if (rota === 'cidades' && m === 'GET') {
      const pais = PAIS_OK.has(url.searchParams.get('pais')) ? url.searchParams.get('pais') : 'br';
      const q = String(url.searchParams.get('q') || '').trim();
      if (q.length < 3) return json(res, { cidades: [] });
      return json(res, { cidades: await cidades(pais, q.slice(0, 80)) });
    }

    if (rota === 'buscar' && m === 'GET') {
      const d = await varrer(url);
      return json(res, d, d.erro ? 400 : 200);
    }

    if (rota === 'site' && m === 'GET') {
      const alvo = normalizarUrl(url.searchParams.get('url'));
      if (!alvo) return json(res, { erro: 'Endereço inválido.' }, 400);
      return json(res, await diagnosticar(alvo));
    }

    if (rota === 'mensagem' && m === 'POST') {
      const dado = await lerCorpoJson(req);
      return json(res, await mensagemIa(dado));
    }

    if (rota === 'instagram' && m === 'GET') {
      const termo = String(url.searchParams.get('termo') || '').trim().slice(0, 60);
      const cidade = String(url.searchParams.get('cidade') || '').trim().slice(0, 60);
      if (!termo) return json(res, { erro: 'Diga o que procura.' }, 400);
      return json(res, await instagram(termo, cidade));
    }

    if (rota === 'vagas' && m === 'GET') {
      return json(res, await vagas(String(url.searchParams.get('termo') || '').trim().slice(0, 60)));
    }

    if (rota === 'perfil') {
      if (m === 'GET') return json(res, await lerPerfil());
      if (m === 'PUT') return json(res, await gravarPerfil(await lerCorpoJson(req, 8192)));
    }

    if (rota === 'leads') {
      if (m === 'GET') return json(res, { leads: await lerLeads() });
      if (m === 'POST') return json(res, { ok: true, ...(await criarLead(await lerCorpoJson(req, 16384))) });
    }

    if (rota.startsWith('leads/')) {
      const id = rota.slice('leads/'.length);
      if (!/^[a-z0-9]{6,24}$/.test(id)) return json(res, { erro: 'Lead inválido.' }, 400);
      if (m === 'PUT') {
        const l = await alterarLead(id, await lerCorpoJson(req, 16384));
        return l ? json(res, { ok: true, lead: l }) : json(res, { erro: 'Lead não encontrado.' }, 404);
      }
      if (m === 'DELETE') return (await apagarLead(id)) ? json(res, { ok: true }) : json(res, { erro: 'Lead não encontrado.' }, 404);
    }

    return json(res, { erro: 'Rota não existe.' }, 404);
  } catch (e) {
    if (e instanceof SyntaxError) return json(res, { erro: 'JSON inválido.' }, 400);
    if (e.message === 'grande') return json(res, { erro: 'Conteúdo grande demais.' }, 413);
    const tempo = e.name === 'AbortError';
    console.error('prospeccao:', rota, e.message);
    return json(res, { erro: tempo ? 'A fonte externa demorou demais. Tente de novo.' : (e.message || 'Erro interno.') }, 502);
  }
}
