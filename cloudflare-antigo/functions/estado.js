/* ============================================================
   Diagnóstico. Fica FORA de /api de propósito: se o painel está
   trancado por falta de senha, ainda assim dá para descobrir o
   porquê abrindo /estado.

   Não revela nada: só diz se cada peça está ligada, nunca o valor.
   ============================================================ */

export async function onRequestGet({ env }) {
  const estado = {
    functions: true,                       // se você está lendo isto, elas rodam
    senhaConfigurada: Boolean(env.SENHA_PAINEL),
    kvLigado: Boolean(env.CONTEUDO),
    r2Ligado: Boolean(env.MIDIA),
    conteudoSalvo: null,
    quando: new Date().toISOString(),
  };

  if (env.CONTEUDO) {
    try {
      const bruto = await env.CONTEUDO.get('site');
      estado.conteudoSalvo = bruto ? Object.keys(JSON.parse(bruto)).length + ' chaves' : 'vazio';
    } catch (e) {
      estado.conteudoSalvo = 'erro ao ler: ' + e.message;
    }
  }

  const faltando = [];
  if (!estado.senhaConfigurada) faltando.push('SENHA_PAINEL (variável secreta)');
  if (!estado.kvLigado) faltando.push('CONTEUDO (KV binding)');
  if (!estado.r2Ligado) faltando.push('MIDIA (R2 binding)');
  estado.faltando = faltando;
  estado.pronto = faltando.length === 0;

  return new Response(JSON.stringify(estado, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
