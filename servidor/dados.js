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

export async function preparar() {
  await fs.mkdir(PASTA_PROPOSTAS, { recursive: true });
  await fs.mkdir(PASTA_FATURAS, { recursive: true });
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

const idFaturaValido = (id) => /^[a-z0-9]{10,32}$/.test(String(id || ''));
const novoIdFatura = () => {
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
      if (!f || !idFaturaValido(f.id)) continue;
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
  if (!idFaturaValido(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(PASTA_FATURAS, id + '.json'), 'utf8'));
  } catch (e) { return null; }
}

export async function gravarFatura(fatura) {
  await preparar();
  if (!fatura || typeof fatura !== 'object' || Array.isArray(fatura)) throw new Error('A fatura precisa ser um objeto.');
  if (!fatura.id) fatura.id = novoIdFatura();
  if (!idFaturaValido(fatura.id)) throw new Error('Identificador de fatura inválido.');
  const antiga = await lerFatura(fatura.id);
  fatura.criadaEm = antiga?.criadaEm || new Date().toISOString();
  fatura.atualizadaEm = new Date().toISOString();
  await gravarJson(path.join(PASTA_FATURAS, fatura.id + '.json'), fatura);
  return fatura;
}

export async function apagarFatura(id) {
  if (!idFaturaValido(id)) return false;
  try { await fs.unlink(path.join(PASTA_FATURAS, id + '.json')); return true; }
  catch (e) { return false; }
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
