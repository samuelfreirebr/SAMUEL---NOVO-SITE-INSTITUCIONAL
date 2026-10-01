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

export async function preparar() {
  await fs.mkdir(PASTA_PROPOSTAS, { recursive: true });
  await fs.mkdir(PASTA_FATURAS, { recursive: true });
  await fs.mkdir(PASTA_REUNIOES, { recursive: true });
  await fs.mkdir(PASTA_CONTRATOS, { recursive: true });
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
