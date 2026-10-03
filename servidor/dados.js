/* ============================================================
   Onde as coisas ficam guardadas.

   Substitui o KV e o R2 da Cloudflare por algo mais simples e
   mais seu: arquivos numa pasta. Essa pasta é um volume do
   Docker, então sobrevive a rebuild, update e restart da stack,
   e você pode copiá-la inteira para fazer backup.

     /dados
       conteudo.json            textos e imagens editados no painel
       conteudo.anterior.json   a versão de antes do último salvar
       propostas/<id>.json      uma proposta por arquivo
       faturas/<id>.json        uma fatura (ou invoice) por arquivo
       reunioes/<id>.json       uma transcrição de reunião por arquivo
       contratos/<id>.json      o contrato de cada proposta (mesmo id)
       formularios/<id>.json    o formulário de perguntas e as respostas
       modelo-contrato.json     o modelo de contrato editado no painel
       img/<pasta>/<arquivo>    o que foi enviado pelo painel

   Gravação atômica em toda escrita: escreve num temporário e
   renomeia. Se faltar luz no meio, o arquivo antigo continua
   inteiro em vez de virar meio-JSON.
   ============================================================ */

import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_DADOS = process.env.PASTA_DADOS || '/dados';

const ARQ_CONTEUDO = path.join(RAIZ_DADOS, 'conteudo.json');
const ARQ_ANTERIOR = path.join(RAIZ_DADOS, 'conteudo.anterior.json');
export const PASTA_PROPOSTAS = path.join(RAIZ_DADOS, 'propostas');
export const PASTA_IMAGENS = path.join(RAIZ_DADOS, 'img');
export const PASTA_FATURAS = path.join(RAIZ_DADOS, 'faturas');
export const PASTA_REUNIOES = path.join(RAIZ_DADOS, 'reunioes');
export const PASTA_CONTRATOS = path.join(RAIZ_DADOS, 'contratos');
export const PASTA_FORMULARIOS = path.join(RAIZ_DADOS, 'formularios');
export const PASTA_ANEXOS = path.join(RAIZ_DADOS, 'briefings');

export async function preparar() {
  await fs.mkdir(PASTA_PROPOSTAS, { recursive: true });
  await fs.mkdir(PASTA_FATURAS, { recursive: true });
  await fs.mkdir(PASTA_REUNIOES, { recursive: true });
  await fs.mkdir(PASTA_CONTRATOS, { recursive: true });
  await fs.mkdir(PASTA_FORMULARIOS, { recursive: true });
  await fs.mkdir(PASTA_ANEXOS, { recursive: true });
  await fs.mkdir(PASTA_IMAGENS, { recursive: true });
}

/* Propostas que já vêm no repositório. Copiadas para o volume só
   se ainda não existirem lá: o que você editar pelo painel nunca
   é sobrescrito por um deploy novo. */
export async function semear() {
  const origem = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sementes');
  let nomes;
  try { nomes = await fs.readdir(origem); } catch (e) { return []; }

  const plantadas = [];
  for (const nome of nomes.filter((n) => n.endsWith('.json'))) {
    const destino = path.join(PASTA_PROPOSTAS, nome);
    if (await fs.stat(destino).catch(() => null)) continue;
    try {
      const bruto = await fs.readFile(path.join(origem, nome), 'utf8');
      const dado = JSON.parse(bruto);          // não planta arquivo torto
      // Só é proposta o que tem id igual ao nome do arquivo. O
      // modelo-proposta.json mora na mesma pasta e não é uma.
      if (!dado || dado.id !== nome.replace(/\.json$/, '')) continue;
      await fs.writeFile(destino, bruto, 'utf8');
      plantadas.push(dado.id);
    } catch (e) { /* semente inválida: ignora em silêncio */ }
  }
  return plantadas;
}

/* ---------- conteúdo do site ---------- */

// Cache em memória: o injetor roda a cada página servida e não
// pode depender de um read de disco por requisição.
let cache = null;

export async function lerConteudo() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(ARQ_CONTEUDO, 'utf8'));
  } catch (e) {
    // Arquivo ainda não existe ou está ilegível: o HTML do
    // repositório é o padrão, e é ele que vai ao ar.
    cache = {};
  }
  return cache;
}

export async function gravarConteudo(dado) {
  await preparar();
  // Guarda a versão anterior: um salvamento ruim não apaga o trabalho.
  try { await fs.copyFile(ARQ_CONTEUDO, ARQ_ANTERIOR); } catch (e) { /* primeira vez */ }
  await gravarJson(ARQ_CONTEUDO, dado);
  cache = dado;
  return { ok: true, salvoEm: new Date().toISOString() };
}

async function gravarJson(destino, dado) {
  const tmp = destino + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(dado, null, 2), 'utf8');
  await fs.rename(tmp, destino);
}

/* ---------- propostas ---------- */

const idValido = (id) => /^[a-z0-9][a-z0-9-]{1,60}$/.test(id);

// O cartão da proposta mostra se o briefing já foi respondido.
async function resumoBriefing(id) {
  const f = await lerFormulario(id);
  if (!f?.link) return null;
  const envios = f.envios || [];
  return { respondidoEm: f.respondidoEm || null, total: envios.filter((e) => e.concluidoEm).length, parciais: envios.filter((e) => !e.concluidoEm).length };
}

export async function listarPropostas() {
  await preparar();
  const nomes = (await fs.readdir(PASTA_PROPOSTAS)).filter((n) => n.endsWith('.json'));
  const itens = [];
  for (const n of nomes) {
    try {
      const p = JSON.parse(await fs.readFile(path.join(PASTA_PROPOSTAS, n), 'utf8'));
      if (!p || !idValido(String(p.id || ''))) continue;   // arquivo solto na pasta não é proposta
      itens.push({
        id: p.id, cliente: p.cliente, titulo: p.titulo,
        criadaEm: p.criadaEm, atualizadaEm: p.atualizadaEm,
        publicada: p.publicada !== false,
        fase: p.fase, reuniao: p.reuniao,
        briefing: await resumoBriefing(p.id),
      });
    } catch (e) { /* arquivo torto: ignora em vez de derrubar a lista */ }
  }
  return itens.sort((a, b) => String(b.criadaEm).localeCompare(String(a.criadaEm)));
}

export async function lerProposta(id) {
  if (!idValido(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(PASTA_PROPOSTAS, id + '.json'), 'utf8'));
  } catch (e) { return null; }
}

export async function gravarProposta(proposta) {
  await preparar();
  if (!idValido(proposta.id)) throw new Error('Identificador inválido. Use letras minúsculas, números e hífen.');
  const antiga = await lerProposta(proposta.id);
  proposta.criadaEm = antiga?.criadaEm || new Date().toISOString();
  proposta.atualizadaEm = new Date().toISOString();
  await gravarJson(path.join(PASTA_PROPOSTAS, proposta.id + '.json'), proposta);
  return proposta;
}

export async function apagarProposta(id) {
  if (!idValido(id)) return false;
  try { await fs.unlink(path.join(PASTA_PROPOSTAS, id + '.json')); return true; }
  catch (e) { return false; }
}

/* ---------- formulários de perguntas ----------
   Um por proposta, com o mesmo id. O link que o cliente recebe usa
   um id sorteado à parte, porque a página é aberta: quem tem o
   endereço responde, e um endereço adivinhável deixaria qualquer um
   mandar resposta no lugar do cliente. */

/* Cada pessoa que abre o link gera um envio, com id próprio. O mesmo
   link recebe quantas respostas vierem (o cliente, um teste, um sócio).
   Formulário antigo guardava uma resposta só: vira o primeiro envio. */
function comEnvios(f) {
  if (f && !Array.isArray(f.envios)) {
    f.envios = f.respondidoEm
      ? [{ id: 'primeiro', iniciadoEm: f.respondidoEm, atualizadoEm: f.respondidoEm, concluidoEm: f.respondidoEm, respostas: f.respostas || {} }]
      : [];
  }
  return f;
}

// O contrato e o selo da lista leem o último envio concluído.
function sincronizarUltimo(f) {
  const ult = f.envios.filter((e) => e.concluidoEm).sort((a, b) => b.concluidoEm.localeCompare(a.concluidoEm))[0];
  if (ult) { f.respostas = ult.respostas; f.respondidoEm = ult.concluidoEm; }
  else { delete f.respostas; delete f.respondidoEm; }
}

export async function lerFormulario(id) {
  if (!idValido(id)) return null;
  try { return comEnvios({ id, ...JSON.parse(await fs.readFile(path.join(PASTA_FORMULARIOS, id + '.json'), 'utf8')) }); }
  catch (e) { return null; }
}

export function gravarFormulario(id, dado) { return naFila(() => gravarFormularioAgora(id, dado)); }

async function gravarFormularioAgora(id, dado) {
  await preparar();
  if (!idValido(id)) throw new Error('Formulário inválido.');
  const antigo = await lerFormulario(id);
  const f = {
    ...antigo, ...dado,
    id,
    // Ligado a uma proposta, o formulário tem o mesmo id dela; em branco, `proposta` é null.
    proposta: dado.proposta !== undefined ? dado.proposta : (antigo ? antigo.proposta ?? null : id),
    link: antigo?.link || novoIdSorteado(),
    criadoEm: antigo?.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
  await gravarJson(path.join(PASTA_FORMULARIOS, id + '.json'), f);
  return f;
}

// A página pública chega pelo link sorteado, não pelo id da proposta.
export async function formularioPeloLink(link) {
  if (!idSorteadoValido(link)) return null;
  await preparar();
  let nomes;
  try { nomes = (await fs.readdir(PASTA_FORMULARIOS)).filter((n) => n.endsWith('.json')); } catch (e) { return null; }
  for (const n of nomes) {
    try {
      const f = JSON.parse(await fs.readFile(path.join(PASTA_FORMULARIOS, n), 'utf8'));
      if (f?.link === link) return comEnvios({ ...f, id: n.replace(/\.json$/, '') });
    } catch (e) { /* arquivo torto: ignora */ }
  }
  return null;
}

/* ---------- lista de formulários ----------
   Todos os briefings juntos: os ligados a uma proposta (mesmo id dela) e
   os em branco (id "avulso-..."). A lista traz só o resumo. */
export async function listarFormularios() {
  await preparar();
  let nomes = [];
  try { nomes = (await fs.readdir(PASTA_FORMULARIOS)).filter((n) => n.endsWith('.json')); } catch (e) { return []; }
  const itens = [];
  for (const n of nomes) {
    const id = n.replace(/\.json$/, '');
    const f = await lerFormulario(id);
    if (!f?.link) continue;
    const proposta = f.proposta ? await lerProposta(f.proposta) : null;
    const envios = f.envios || [];
    itens.push({
      id, link: f.link, proposta: f.proposta || null,
      cliente: proposta?.cliente || '',
      titulo: f.titulo || '',
      criadoEm: f.criadoEm, atualizadoEm: f.atualizadoEm,
      respondidoEm: f.respondidoEm || null,
      total: envios.filter((e) => e.concluidoEm).length,
      parciais: envios.filter((e) => !e.concluidoEm).length,
      perguntas: (f.blocos || []).filter((b) => b.ligado !== false).reduce((x, b) => x + (b.perguntas || []).filter((q) => q.pergunta).length, 0),
    });
  }
  return itens.sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
}

// `dado.proposta` liga a uma proposta (o id do formulário é o dela); sem ele, nasce em branco.
export async function criarFormulario(dado) {
  if (dado.proposta) {
    const ja = await lerFormulario(dado.proposta);
    if (ja) return { f: ja, criado: false };
    return { f: await gravarFormulario(dado.proposta, { proposta: dado.proposta, ...dado.base }), criado: true };
  }
  const id = 'avulso-' + novoIdSorteado().slice(0, 8);
  return { f: await gravarFormulario(id, { proposta: null, ...dado.base }), criado: true };
}

export function apagarFormulario(id) {
  return naFila(async () => {
    const f = await lerFormulario(id);
    if (!f) return false;
    await fs.unlink(path.join(PASTA_FORMULARIOS, id + '.json'));
    // Os arquivos que o cliente subiu moram numa pasta com o link: saem juntos.
    if (f.link && idSorteadoValido(f.link)) await fs.rm(path.join(PASTA_ANEXOS, f.link), { recursive: true, force: true });
    return true;
  });
}

/* Gravações do mesmo arquivo uma atrás da outra: dois clientes
   respondendo juntos não podem pisar um no outro (ler, mexer, gravar). */
let fila = Promise.resolve();
const naFila = (fn) => { const r = fila.then(fn, fn); fila = r.catch(() => {}); return r; };

const idEnvioValido = (id) => /^[a-z0-9]{8,40}$/.test(String(id || ''));
const MAX_ENVIOS = 300;

// `concluir` falso grava o andamento; verdadeiro fecha o envio.
export function salvarEnvio(link, { envio, respostas, concluir }) {
  return naFila(async () => {
    const f = await formularioPeloLink(link);
    if (!f) return null;
    if (!idEnvioValido(envio)) throw new Error('Envio inválido.');
    const agora = new Date().toISOString();
    let e = f.envios.find((x) => x.id === envio);
    if (!e) {
      if (f.envios.length >= MAX_ENVIOS) throw new Error('Limite de respostas deste link atingido.');
      e = { id: envio, iniciadoEm: agora, concluidoEm: null, respostas: {} };
      f.envios.push(e);
    }
    // Andamento que chega depois de concluído (aba fechando) não reabre o envio.
    if (e.concluidoEm && !concluir) return f;
    e.respostas = respostas;
    e.atualizadoEm = agora;
    if (concluir) e.concluidoEm = e.concluidoEm || agora;
    sincronizarUltimo(f);
    f.atualizadoEm = agora;
    await gravarJson(path.join(PASTA_FORMULARIOS, f.id + '.json'), f);
    return f;
  });
}

export function apagarEnvio(id, envio) {
  return naFila(async () => {
    const f = await lerFormulario(id);
    if (!f) return null;
    f.envios = f.envios.filter((e) => e.id !== envio);
    sincronizarUltimo(f);
    f.atualizadoEm = new Date().toISOString();
    await gravarJson(path.join(PASTA_FORMULARIOS, id + '.json'), f);
    return f;
  });
}

/* ---------- arquivos que o cliente sobe no briefing ----------
   Ficam numa pasta por formulário, com o nome do link sorteado:
   quem tem o endereço do briefing tem os arquivos dele, e só.    */

const ANEXOS_OK = /\.(jpe?g|png|webp|avif|gif|svg|pdf|ai|eps|psd|indd|zip|rar|docx?|xlsx?|pptx?|txt|md|csv|mp4|mov|otf|ttf)$/i;
export const LIMITE_ANEXO = 20 * 1024 * 1024;    // 20 MB por arquivo
const MAX_ANEXOS = 40;                           // por briefing

const nomeLimpo = (nome) => String(nome || 'arquivo')
  .split(/[\\/]/).pop()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9.]+/g, '-')
  .replace(/^[-.]+|-+$/g, '')
  .slice(0, 80) || 'arquivo';

export async function gravarAnexo(link, nomeOriginal, bytes) {
  if (!idSorteadoValido(link)) throw new Error('Briefing inválido.');
  const nome = nomeLimpo(nomeOriginal);
  if (!ANEXOS_OK.test(nome)) throw new Error('Este tipo de arquivo não é aceito aqui. Mande imagem, PDF, documento ou um ZIP.');
  if (bytes.length > LIMITE_ANEXO) throw new Error('Arquivo de ' + (bytes.length / 1048576).toFixed(1) + ' MB. O limite é 20 MB.');

  const dir = path.join(PASTA_ANEXOS, link);
  await fs.mkdir(dir, { recursive: true });
  const jaTem = (await fs.readdir(dir).catch(() => [])).length;
  if (jaTem >= MAX_ANEXOS) throw new Error('Limite de ' + MAX_ANEXOS + ' arquivos neste briefing. Mande o resto como link de pasta.');

  const guardado = Date.now().toString(36) + '-' + nome;
  await fs.writeFile(path.join(dir, guardado), bytes);
  return { nome, guardado, url: '/perguntas/' + link + '/arquivo/' + guardado };
}

// Caminho de um anexo para servir. Null quando o nome é torto.
export function caminhoAnexo(link, guardado) {
  if (!idSorteadoValido(link)) return null;
  const nome = String(guardado || '');
  if (!nome || nome.includes('/') || nome.includes('\\') || nome.includes('..')) return null;
  return path.join(PASTA_ANEXOS, link, nome);
}

export async function listarAnexos(link) {
  if (!idSorteadoValido(link)) return [];
  const dir = path.join(PASTA_ANEXOS, link);
  const nomes = await fs.readdir(dir).catch(() => []);
  const itens = [];
  for (const n of nomes) {
    const st = await fs.stat(path.join(dir, n)).catch(() => null);
    if (st?.isFile()) itens.push({ nome: n.replace(/^[a-z0-9]+-/, ''), guardado: n, tamanho: st.size, url: '/perguntas/' + link + '/arquivo/' + n });
  }
  return itens;
}

/* ---------- faturas ----------
   O id é sorteado no primeiro salvar e vai no link que o cliente
   recebe. Aleatório de propósito: a fatura traz CPF, CNPJ e dados
   bancários, e um endereço sequencial (fatura-001, fatura-002) se
   deixaria adivinhar.                                              */

const idSorteadoValido = (id) => /^[a-z0-9]{10,32}$/.test(String(id || ''));
const novoIdSorteado = () => {
  const letras = 'abcdefghijkmnpqrstuvwxyz23456789';   // sem 0/o, 1/l
  return [...randomBytes(12)].map((b) => letras[b % letras.length]).join('');
};

export async function listarFaturas() {
  await preparar();
  const nomes = (await fs.readdir(PASTA_FATURAS)).filter((n) => n.endsWith('.json'));
  const itens = [];
  for (const n of nomes) {
    try {
      const f = JSON.parse(await fs.readFile(path.join(PASTA_FATURAS, n), 'utf8'));
      if (!f || !idSorteadoValido(f.id)) continue;
      itens.push({
        id: f.id, tipo: f.tipo, codigo: f.codigo, cliente: f.cliente?.nome || '',
        servico: f.servico?.titulo || '', valor: f.valor, moeda: f.moeda,
        emissao: f.emissao, vencimento: f.vencimento, paga: Boolean(f.paga), pagaEm: f.pagaEm,
        criadaEm: f.criadaEm, atualizadaEm: f.atualizadaEm,
      });
    } catch (e) { /* arquivo torto: ignora em vez de derrubar a lista */ }
  }
  return itens.sort((a, b) => String(b.criadaEm).localeCompare(String(a.criadaEm)));
}

// A última completa, para a próxima nascer com os dados do prestador.
export async function ultimaFatura(tipo) {
  const lista = (await listarFaturas()).filter((f) => !tipo || f.tipo === tipo);
  return lista.length ? lerFatura(lista[0].id) : null;
}

export async function lerFatura(id) {
  if (!idSorteadoValido(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(PASTA_FATURAS, id + '.json'), 'utf8'));
  } catch (e) { return null; }
}

export async function gravarFatura(fatura) {
  await preparar();
  if (!fatura || typeof fatura !== 'object' || Array.isArray(fatura)) throw new Error('A fatura precisa ser um objeto.');
  if (!fatura.id) fatura.id = novoIdSorteado();
  if (!idSorteadoValido(fatura.id)) throw new Error('Identificador de fatura inválido.');
  const antiga = await lerFatura(fatura.id);
  fatura.criadaEm = antiga?.criadaEm || new Date().toISOString();
  fatura.atualizadaEm = new Date().toISOString();
  await gravarJson(path.join(PASTA_FATURAS, fatura.id + '.json'), fatura);
  return fatura;
}

export async function apagarFatura(id) {
  if (!idSorteadoValido(id)) return false;
  try { await fs.unlink(path.join(PASTA_FATURAS, id + '.json')); return true; }
  catch (e) { return false; }
}

/* ---------- reuniões ----------
   Transcrições que o Google Meet gera e um script na conta Google
   manda para cá (material/meet-para-painel.gs). "origem" é o id do
   arquivo no Drive: a mesma transcrição enviada duas vezes não
   duplica. A proposta aponta para a reunião (proposta.reuniao), e o
   texto fica só aqui, fora do JSON que o editor salva a cada tecla. */

export async function listarReunioes() {
  await preparar();
  const itens = [];
  for (const n of (await fs.readdir(PASTA_REUNIOES)).filter((x) => x.endsWith('.json'))) {
    try {
      const r = JSON.parse(await fs.readFile(path.join(PASTA_REUNIOES, n), 'utf8'));
      if (!r || !idSorteadoValido(r.id)) continue;
      itens.push({ id: r.id, origem: r.origem, titulo: r.titulo, data: r.data, recebidaEm: r.recebidaEm, tamanho: String(r.texto || '').length });
    } catch (e) { /* arquivo torto: ignora */ }
  }
  return itens.sort((a, b) => String(b.data || b.recebidaEm).localeCompare(String(a.data || a.recebidaEm)));
}

export async function lerReuniao(id) {
  if (!idSorteadoValido(id)) return null;
  try { return JSON.parse(await fs.readFile(path.join(PASTA_REUNIOES, id + '.json'), 'utf8')); }
  catch (e) { return null; }
}

export async function gravarReuniao({ origem, titulo, data, texto }) {
  await preparar();
  const corpo = String(texto || '').trim();
  if (!corpo) throw new Error('A transcrição veio vazia.');
  const chave = String(origem || '').slice(0, 200);
  const repetida = chave && (await listarReunioes()).find((r) => r.origem === chave);
  if (repetida) return { ...repetida, repetida: true };
  const r = {
    id: novoIdSorteado(), origem: chave,
    titulo: String(titulo || 'Reunião').slice(0, 300),
    data: /^\d{4}-\d{2}-\d{2}/.test(String(data || '')) ? String(data).slice(0, 30) : new Date().toISOString(),
    texto: corpo.slice(0, 400000),
    recebidaEm: new Date().toISOString(),
  };
  await gravarJson(path.join(PASTA_REUNIOES, r.id + '.json'), r);
  return r;
}

export async function apagarReuniao(id) {
  if (!idSorteadoValido(id)) return false;
  try { await fs.unlink(path.join(PASTA_REUNIOES, id + '.json')); return true; }
  catch (e) { return false; }
}

/* ---------- contratos ----------
   Um por proposta, com o mesmo id. O texto é o contrato inteiro, do
   jeito que foi gerado e depois editado à mão no painel. */

export async function lerContrato(id) {
  if (!idValido(id)) return null;
  try { return JSON.parse(await fs.readFile(path.join(PASTA_CONTRATOS, id + '.json'), 'utf8')); }
  catch (e) { return null; }
}

export async function gravarContrato(id, dado) {
  await preparar();
  if (!idValido(id)) throw new Error('Proposta inválida.');
  const antigo = await lerContrato(id);
  const c = { ...antigo, ...dado, proposta: id, criadoEm: antigo?.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString() };
  await gravarJson(path.join(PASTA_CONTRATOS, id + '.json'), c);
  return c;
}

const ARQ_MODELO_CONTRATO = path.join(RAIZ_DADOS, 'modelo-contrato.json');

// Sem arquivo no volume, quem chama usa o modelo padrão do código.
export async function lerModeloContrato() {
  try { return JSON.parse(await fs.readFile(ARQ_MODELO_CONTRATO, 'utf8')); } catch (e) { return {}; }
}

export async function gravarModeloContrato(dado) {
  await preparar();
  await gravarJson(ARQ_MODELO_CONTRATO, { texto: String(dado?.texto || ''), contaReais: String(dado?.contaReais || '') });
  return { ok: true };
}

/* ---------- modelo de proposta ----------
   O que toda proposta nova já traz preenchido: escopo, o que inclui,
   condições, quem assina, encerramento. Vive no volume; sem arquivo
   lá, vale a semente do repositório.                               */

const ARQ_MODELO = path.join(RAIZ_DADOS, 'modelo-proposta.json');
const SEMENTE_MODELO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sementes', 'modelo-proposta.json');

export async function lerModelo() {
  for (const arq of [ARQ_MODELO, SEMENTE_MODELO]) {
    try { return JSON.parse(await fs.readFile(arq, 'utf8')); } catch (e) { /* próximo */ }
  }
  return {};
}

export async function gravarModelo(dado) {
  await preparar();
  await gravarJson(ARQ_MODELO, dado);
  return { ok: true, salvoEm: new Date().toISOString() };
}

/* ---------- imagens ---------- */

const PASTAS_OK = ['clientes', 'projetos', 'bastidores', 'propostas', 'geral'];

export async function listarImagens() {
  await preparar();
  const itens = [];
  for (const pasta of PASTAS_OK) {
    const dir = path.join(PASTA_IMAGENS, pasta);
    let nomes;
    try { nomes = await fs.readdir(dir); } catch (e) { continue; }
    for (const nome of nomes) {
      const st = await fs.stat(path.join(dir, nome)).catch(() => null);
      if (!st?.isFile()) continue;
      itens.push({
        chave: `${pasta}/${nome}`, url: `/img/${pasta}/${nome}`,
        tamanho: st.size, em: st.mtime.toISOString(),
      });
    }
  }
  return itens.sort((a, b) => b.em.localeCompare(a.em));
}

export async function gravarImagem(pasta, nomeOriginal, bytes) {
  if (!PASTAS_OK.includes(pasta)) throw new Error('Pasta inválida.');
  await fs.mkdir(path.join(PASTA_IMAGENS, pasta), { recursive: true });

  // Nome previsível e sem acento, para nunca quebrar a URL.
  const limpo = (nomeOriginal || 'imagem')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const nome = `${Date.now().toString(36)}-${limpo}`;
  await fs.writeFile(path.join(PASTA_IMAGENS, pasta, nome), bytes);
  return { chave: `${pasta}/${nome}`, url: `/img/${pasta}/${nome}` };
}

export async function apagarImagem(chave) {
  const [pasta, nome] = String(chave).split('/');
  if (!PASTAS_OK.includes(pasta) || !nome || nome.includes('..') || nome.includes('/')) return false;
  try { await fs.unlink(path.join(PASTA_IMAGENS, pasta, nome)); return true; }
  catch (e) { return false; }
}
