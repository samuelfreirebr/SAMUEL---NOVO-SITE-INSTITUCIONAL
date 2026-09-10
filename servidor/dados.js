/* ============================================================
   Onde as coisas ficam guardadas.

   Substitui o KV e o R2 da Cloudflare por algo mais simples e
   mais seu: arquivos numa pasta. Essa pasta é um volume do
   Docker, então sobrevive a rebuild, update e restart da stack —
   e você pode copiá-la inteira para fazer backup.

     /dados
       conteudo.json            textos e imagens editados no painel
       conteudo.anterior.json   a versão de antes do último salvar
       propostas/<id>.json      uma proposta por arquivo
       img/<pasta>/<arquivo>    o que foi enviado pelo painel

   Gravação atômica em toda escrita: escreve num temporário e
   renomeia. Se faltar luz no meio, o arquivo antigo continua
   inteiro em vez de virar meio-JSON.
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_DADOS = process.env.PASTA_DADOS || '/dados';

const ARQ_CONTEUDO = path.join(RAIZ_DADOS, 'conteudo.json');
const ARQ_ANTERIOR = path.join(RAIZ_DADOS, 'conteudo.anterior.json');
export const PASTA_PROPOSTAS = path.join(RAIZ_DADOS, 'propostas');
export const PASTA_IMAGENS = path.join(RAIZ_DADOS, 'img');

export async function preparar() {
  await fs.mkdir(PASTA_PROPOSTAS, { recursive: true });
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
      JSON.parse(bruto);                       // não planta arquivo torto
      await fs.writeFile(destino, bruto, 'utf8');
      plantadas.push(nome.replace(/\.json$/, ''));
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
      itens.push({
        id: p.id, cliente: p.cliente, titulo: p.titulo,
        criadaEm: p.criadaEm, atualizadaEm: p.atualizadaEm,
        publicada: p.publicada !== false,
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
