/* ============================================================
   Tranca do painel.

   Senha em HTTP Basic, guardada na variável SENHA_PAINEL da
   stack. Sem senha configurada, nega — falha fechado. Uma
   proteção que depende de alguém lembrar de ligar não é
   proteção; foi exatamente esse o furo da versão anterior.
   ============================================================ */

import { timingSafeEqual } from 'node:crypto';

const USUARIO = process.env.USUARIO_PAINEL || 'samuel';

// Comparação de tempo constante: um === simples vaza o tamanho do
// prefixo correto para quem cronometra as respostas.
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

export const temSenhaConfigurada = () => Boolean(process.env.SENHA_PAINEL);

export function liberado(req) {
  const esperada = process.env.SENHA_PAINEL;
  if (!esperada) return false;

  const cab = req.headers['authorization'] || '';
  if (!cab.startsWith('Basic ')) return false;

  let cru;
  try { cru = Buffer.from(cab.slice(6), 'base64').toString('utf8'); }
  catch (e) { return false; }

  const corte = cru.indexOf(':');
  if (corte < 0) return false;

  // Os dois lados sempre são comparados: sair cedo no usuário
  // errado transformaria o tempo de resposta em pista.
  const u = iguais(cru.slice(0, corte), USUARIO);
  const s = iguais(cru.slice(corte + 1), esperada);
  return u && s;
}

export function pedirSenha(res) {
  const semSenha = !temSenhaConfigurada();
  const cabecalhos = {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  };
  // Sem senha configurada não adianta pedir credencial: o navegador
  // ficaria pedindo em laço.
  if (!semSenha) cabecalhos['www-authenticate'] = 'Basic realm="Painel", charset="UTF-8"';

  res.writeHead(401, cabecalhos);
  res.end(semSenha
    ? 'Painel trancado: nenhuma senha configurada. Defina SENHA_PAINEL nas variáveis da stack no Portainer e suba de novo.'
    : 'Acesso restrito.');
}
