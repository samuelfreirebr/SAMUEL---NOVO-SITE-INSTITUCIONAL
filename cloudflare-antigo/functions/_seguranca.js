/* ============================================================
   Tranca do painel.

   Duas chaves servem, e basta uma:
     · Cloudflare Access  — o cabeçalho Cf-Access-Jwt-Assertion
     · senha              — HTTP Basic, com a senha guardada como
                            variável secreta SENHA_PAINEL no Pages

   Regra: sem SENHA_PAINEL configurada e sem Access, nega. Falha
   fechado — uma proteção que depende de alguém lembrar de ligar
   não é proteção.
   ============================================================ */

const USUARIO = 'samuel';

// Comparação de tempo constante: um == simples vaza o tamanho do
// prefixo correto para quem cronometra as respostas.
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function temAccess(request) {
  return Boolean(request.headers.get('Cf-Access-Jwt-Assertion'));
}

export function temSenha(request, env) {
  const esperada = env.SENHA_PAINEL;
  if (!esperada) return false;

  const cab = request.headers.get('Authorization') || '';
  if (!cab.startsWith('Basic ')) return false;

  let cru;
  try { cru = atob(cab.slice(6)); } catch (e) { return false; }

  const corte = cru.indexOf(':');
  if (corte < 0) return false;

  return iguais(cru.slice(0, corte), USUARIO) && iguais(cru.slice(corte + 1), esperada);
}

export function liberado(request, env) {
  return temAccess(request) || temSenha(request, env);
}

export function pedirSenha(env) {
  const semSenha = !env.SENHA_PAINEL;
  return new Response(
    semSenha
      ? 'Painel trancado: nenhuma senha configurada. Defina a variável SENHA_PAINEL nas configurações do projeto no Cloudflare Pages.'
      : 'Acesso restrito.',
    {
      status: 401,
      headers: {
        // Sem senha configurada não adianta pedir credencial: o navegador
        // ficaria pedindo em laço.
        ...(semSenha ? {} : { 'WWW-Authenticate': 'Basic realm="Painel", charset="UTF-8"' }),
        'content-type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
}
