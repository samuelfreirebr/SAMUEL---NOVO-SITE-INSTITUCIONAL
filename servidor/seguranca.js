/* ============================================================
   Tranca do painel.

   Duas chaves abrem, e basta uma:
     · sessão   — cookie assinado, criado pela tela de login
                  (/admin/entrar). É o caminho normal.
     · Basic    — usuário:senha no cabeçalho, para curl e testes.

   A senha vem da variável SENHA_PAINEL da stack. Sem ela, nega —
   falha fechado. Uma proteção que depende de alguém lembrar de
   ligar não é proteção; foi exatamente esse o furo da primeira
   versão.

   O cookie é assinado com uma chave derivada da senha: trocar a
   senha na stack derruba todas as sessões abertas, sem precisar
   de banco nem de lista de tokens.
   ============================================================ */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const USUARIO = () => process.env.USUARIO_PAINEL || 'samuel';
const SENHA = () => process.env.SENHA_PAINEL || '';

const COOKIE = 'painel';
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000;   // uma semana

// Comparação de tempo constante: um === simples vaza o tamanho do
// prefixo correto para quem cronometra as respostas.
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

export const temSenhaConfigurada = () => Boolean(SENHA());

/* ---------- credenciais ---------- */

export function conferirCredenciais(usuario, senha) {
  if (!temSenhaConfigurada()) return false;
  // Os dois lados sempre são comparados: sair cedo no usuário
  // errado transformaria o tempo de resposta em pista.
  const u = iguais(String(usuario || ''), USUARIO());
  const s = iguais(String(senha || ''), SENHA());
  return u && s;
}

function temBasic(req) {
  const cab = req.headers['authorization'] || '';
  if (!cab.startsWith('Basic ')) return false;
  let cru;
  try { cru = Buffer.from(cab.slice(6), 'base64').toString('utf8'); }
  catch (e) { return false; }
  const corte = cru.indexOf(':');
  if (corte < 0) return false;
  return conferirCredenciais(cru.slice(0, corte), cru.slice(corte + 1));
}

/* ---------- sessão por cookie ---------- */

const chave = () => createHmac('sha256', 'sessao-do-painel').update(SENHA()).digest();
const assinar = (corpo) => createHmac('sha256', chave()).update(corpo).digest('base64url');

export function criarSessao() {
  const corpo = String(Date.now() + DURACAO_MS) + '.' + randomBytes(9).toString('base64url');
  return corpo + '.' + assinar(corpo);
}

function lerCookie(req, nome) {
  const cru = req.headers['cookie'] || '';
  for (const parte of cru.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

export function temSessao(req) {
  if (!temSenhaConfigurada()) return false;
  const token = lerCookie(req, COOKIE);
  if (!token) return false;
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  const corpo = partes[0] + '.' + partes[1];
  if (!iguais(partes[2], assinar(corpo))) return false;
  return Number(partes[0]) > Date.now();
}

// Atrás do Traefik a conexão chega em HTTP; quem diz que o visitante
// veio por HTTPS é o cabeçalho X-Forwarded-Proto. Só então o cookie
// pode ser Secure — marcá-lo assim em http://localhost o perderia.
const ehHttps = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
  || Boolean(req.socket && req.socket.encrypted);

export function cookieDeSessao(req, token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DURACAO_MS / 1000)}`
    + (ehHttps(req) ? '; Secure' : '');
}

export function cookieDeSaida() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function liberado(req) {
  return temSessao(req) || temBasic(req);
}

/* ---------- freio de tentativas ----------
   Poucas falhas seguidas do mesmo endereço bloqueiam por um tempo.
   Não é defesa contra quem tem paciência, mas transforma "chutar
   até acertar" em algo que leva semanas em vez de minutos.        */

const TENTATIVAS_MAX = 8;
const BLOQUEIO_MS = 10 * 60 * 1000;
const tentativas = new Map();   // ip → { erros, ate }

export function enderecoDe(req) {
  const enc = req.headers['x-forwarded-for'];
  if (enc) return String(enc).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

export function bloqueado(req) {
  const t = tentativas.get(enderecoDe(req));
  if (!t) return 0;
  if (t.ate && t.ate > Date.now()) return Math.ceil((t.ate - Date.now()) / 1000);
  return 0;
}

export function registrarFalha(req) {
  const ip = enderecoDe(req);
  const t = tentativas.get(ip) || { erros: 0, ate: 0 };
  t.erros += 1;
  if (t.erros >= TENTATIVAS_MAX) { t.ate = Date.now() + BLOQUEIO_MS; t.erros = 0; }
  tentativas.set(ip, t);
  // não deixa o mapa crescer para sempre
  if (tentativas.size > 5000) tentativas.clear();
}

export function limparFalhas(req) {
  tentativas.delete(enderecoDe(req));
}
