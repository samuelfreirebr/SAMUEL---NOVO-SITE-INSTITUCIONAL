/* ============================================================
   Formulário de perguntas.

   Depois da proposta aceita, o cliente precisa mandar duas coisas:
   os dados para o contrato (razão social, CNPJ, endereço) e as
   informações do projeto (o que vai no site, textos, acessos). Em
   vez de ficar cobrando por WhatsApp, o painel gera um formulário
   com o link e o cliente responde uma vez só.

   As perguntas do contrato são fixas: são exatamente os campos que
   saem como [PREENCHER] em contrato.js. As do projeto a IA escreve
   a partir da proposta e da transcrição da reunião, porque mudam de
   cliente para cliente.

   O link é sorteado, como o da fatura: a página é aberta (o cliente
   não tem login) e o endereço é a credencial.
   ============================================================ */

import { pedirJsonIa, temChaveIa, semTravessao } from './proposta-ia.js';

const limpo = (t) => semTravessao(t).trim();

/* ---------- o bloco fixo: o que o contrato precisa ---------- */
export const BLOCO_CONTRATO = {
  id: 'contrato',
  titulo: 'Dados para o contrato',
  texto: 'São os dados que entram no contrato. Se você é pessoa física, use CPF e o nome completo.',
  perguntas: [
    { id: 'razaoSocial', pergunta: 'Razão social ou nome completo', tipo: 'texto', obrigatoria: true },
    { id: 'documento', pergunta: 'CNPJ ou CPF', tipo: 'texto', obrigatoria: true },
    { id: 'endereco', pergunta: 'Endereço completo', ajuda: 'Rua, número, bairro, cidade, estado e CEP.', tipo: 'longo', obrigatoria: true },
    { id: 'email', pergunta: 'E-mail para o contrato', tipo: 'email', obrigatoria: true },
    { id: 'responsavel', pergunta: 'Quem assina pela empresa', ajuda: 'Nome de quem vai assinar, se for diferente do nome acima.', tipo: 'texto' },
    { id: 'telefone', pergunta: 'Telefone ou WhatsApp', tipo: 'texto' },
  ],
};

/* Esses quatro preenchem o CONTRATANTE do contrato. */
export function contratanteDasRespostas(r) {
  if (!r) return null;
  const linhas = [r.razaoSocial, r.documento, r.email, r.endereco].map(limpo).filter(Boolean);
  return linhas.length >= 2 ? linhas : null;
}

/* ---------- as perguntas do projeto, pela IA ---------- */

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['blocos'],
  properties: {
    blocos: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['titulo', 'texto', 'perguntas'],
        properties: {
          titulo: { type: 'string', description: 'Nome do bloco. Ex.: Sobre a empresa, Conteúdo do site, Acessos.' },
          texto: { type: 'string', description: 'Uma linha explicando por que esse bloco é necessário.' },
          perguntas: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['pergunta', 'ajuda', 'tipo', 'opcoes', 'obrigatoria'],
              properties: {
                pergunta: { type: 'string' },
                ajuda: { type: 'string', description: 'Uma linha de exemplo ou explicação. Vazio se a pergunta já se explica.' },
                tipo: { type: 'string', enum: ['texto', 'longo', 'escolha', 'varias', 'email', 'link', 'telefone'] },
                opcoes: { type: 'array', items: { type: 'string' }, description: 'Só para "escolha" (uma) e "varias" (mais de uma). Vazio nos outros.' },
                obrigatoria: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

const SISTEMA = `Você monta o formulário que Samuel Freire, designer e webdesigner brasileiro, manda ao cliente logo depois que a proposta é aceita. O objetivo é recolher de uma vez só tudo o que ele precisa para começar, sem ficar cobrando por mensagem.

Você recebe a proposta aprovada e, quando houver, a transcrição da reunião. Devolve blocos de perguntas em português do Brasil.

Regras:
Siga o padrão dos briefings que o Samuel já usa:
- Blocos na ordem do trabalho: a marca, a identidade visual, o estilo, o conteúdo, o público e a copy, as seções, os acessos. Use só os que fazem sentido para o que foi contratado.
- Pergunta curta, com um exemplo entre parênteses quando ajudar. Ex.: "Qual é o nome da marca exatamente como deve aparecer no site?" com ajuda "Exemplo: Elora Beauty Hair".
- Em pergunta que pode não se aplicar, a ajuda diz o que fazer: "Se não tiver, escreva Não".
- Material do cliente (logo, fotos, textos) se pede como link de pasta, tipo "link", com ajuda "Cole o link da pasta no Drive".
- "escolha" quando houver poucas respostas possíveis e elas mudam o trabalho (site claro ou escuro, já tem identidade visual, vende por CPF ou CNPJ). "varias" quando o cliente pode marcar mais de uma (sensação que o site precisa passar). "longo" para texto corrido, "link" para endereço, "email" e "telefone" para contato.
- Pergunte só o que é necessário para executar o que foi contratado. Se é identidade visual: marca, público, referências, aplicações. Se é site: páginas, textos, fotos, domínio, hospedagem. Se tem loja: produtos, pagamento, envio. Se tem sistema: fluxos e acessos.
- O que já ficou decidido na reunião não vira pergunta. Se o cliente já disse a cor, o nome ou o prazo, não pergunte de novo.
- Dados de contrato (CNPJ, endereço, razão social) NÃO são com você: já existem num bloco à parte.
- De 2 a 5 blocos, de 3 a 7 perguntas cada.
- Marque como obrigatória só o que trava o início do projeto.
- Nunca use travessão. Use vírgula, dois-pontos ou ponto.`;

function resumo(p) {
  return `Proposta aprovada:
- cliente: ${p.cliente || '(sem nome)'}
- o que foi contratado: ${(p.escopo || []).map((e) => e.titulo + (e.descricao ? ' (' + e.descricao + ')' : '')).join(' | ') || '(não informado)'}
- o que cada entrega inclui: ${(p.inclui?.itens || []).join(' | ') || '(não informado)'}
- investimento: ${p.investimento?.valorParcela ? `${p.investimento.parcelas}x ${p.investimento.moeda} ${p.investimento.valorParcela}` : '(não informado)'}`;
}

const idDe = (t, i) => (String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'p') + '-' + i;

export async function gerarPerguntas({ proposta, transcricao }) {
  const p = proposta || {};
  const avisos = [];
  let ia = null, usado = null;

  if (temChaveIa()) {
    const partes = [{ type: 'input_text', text: resumo(p) }];
    if (transcricao) partes.push({ type: 'input_text', text: `--- Transcrição da reunião ---\n${String(transcricao).slice(0, 60000)}` });
    try {
      const r = await pedirJsonIa(partes, { sistema: SISTEMA, esquema: ESQUEMA, nome: 'formulario_de_perguntas' });
      ia = r.ia; usado = r.modelo;
    } catch (e) { avisos.push('A IA não respondeu (' + e.message + '). O formulário saiu só com os dados do contrato.'); }
  } else {
    avisos.push('IA desligada (sem OPENAI_API_KEY): o formulário saiu só com os dados do contrato.');
  }

  const doProjeto = (ia?.blocos || []).map((b, bi) => ({
    id: idDe(b.titulo, bi),
    titulo: limpo(b.titulo),
    texto: limpo(b.texto),
    perguntas: (b.perguntas || []).filter((q) => limpo(q.pergunta)).map((q, qi) => ({
      id: idDe(q.pergunta, bi * 100 + qi),
      pergunta: limpo(q.pergunta),
      ajuda: limpo(q.ajuda),
      tipo: ['texto', 'longo', 'escolha', 'varias', 'email', 'link', 'telefone'].includes(q.tipo) ? q.tipo : 'texto',
      opcoes: (q.opcoes || []).map(limpo).filter(Boolean),
      obrigatoria: Boolean(q.obrigatoria),
    })),
  })).filter((b) => b.perguntas.length);

  if (!doProjeto.length && temChaveIa() && ia) avisos.push('A IA não achou o que perguntar sobre o projeto. Só o bloco do contrato foi montado.');

  // Uma pergunta leva mais ou menos meio minuto; arredonda para cinco.
  const total = doProjeto.reduce((n, b) => n + b.perguntas.length, BLOCO_CONTRATO.perguntas.length);
  const minutos = Math.max(5, Math.round(total * 0.5 / 5) * 5);

  return {
    titulo: `Briefing${p.cliente ? ' | ' + p.cliente : ''}`,
    texto: `Este formulário leva de ${minutos} a ${minutos + 5} minutos. Se não souber responder alguma pergunta, escreva "Não sei" que a gente resolve junto depois. Assim que chegar, eu começo e mando o contrato para assinatura.`,
    blocos: [BLOCO_CONTRATO, ...doProjeto],
    avisos,
    ia: usado,
  };
}

/* ---------- a página que o cliente abre ---------- */

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function campo(q) {
  const req = q.obrigatoria ? ' required' : '';
  const n = esc(q.id);
  if (q.tipo === 'longo') return `<textarea id="${n}" name="${n}" rows="4"${req}></textarea>`;
  if ((q.tipo === 'escolha' || q.tipo === 'varias') && q.opcoes.length) {
    const uma = q.tipo === 'escolha';
    return `<div class="pg-opcoes">${q.opcoes.map((o, i) => `
      <label class="pg-opcao"><input type="${uma ? 'radio' : 'checkbox'}" name="${n}" value="${esc(o)}"${uma && i === 0 && q.obrigatoria ? ' required' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
  }
  const tipo = q.tipo === 'email' ? 'email' : q.tipo === 'link' ? 'url' : q.tipo === 'telefone' ? 'tel' : 'text';
  const dica = q.tipo === 'link' ? ' placeholder="https://"' : q.tipo === 'telefone' ? ' placeholder="(00) 00000-0000"' : q.tipo === 'email' ? ' placeholder="email@exemplo.com"' : '';
  return `<input type="${tipo}" id="${n}" name="${n}"${dica}${req}>`;
}

export function renderizarPerguntas(f, { respondido = false } = {}) {
  const blocos = (f.blocos || []).map((b, i) => `
  <section class="pg-bloco">
    <p class="eyebrow">${String(i + 1).padStart(2, '0')} ${esc(b.titulo)}</p>
    ${b.texto ? `<p class="pg-bloco__texto">${esc(b.texto)}</p>` : ''}
    ${b.perguntas.map((q) => `
    <div class="pg-campo">
      <label for="${esc(q.id)}">${esc(q.pergunta)}${q.obrigatoria ? '' : ' <small>(opcional)</small>'}</label>
      ${q.ajuda ? `<p class="pg-ajuda">${esc(q.ajuda)}</p>` : ''}
      ${campo(q)}
    </div>`).join('')}
  </section>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(f.titulo || 'Informações para começar')}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/base.css">
<link rel="stylesheet" href="/styles/perguntas.css?v=q1">
<link rel="icon" href="/img/favicon.png">
</head>
<body class="perguntas">

<header class="pg-topo">
  <div class="wrap pg-topo__in">
    <span class="pg-marca">Samuel<em>Freire</em></span>
    <span class="eyebrow pg-topo__tag">Informações do projeto</span>
  </div>
</header>

<main class="wrap pg-folha">
  <h1 class="h2 pg-titulo">${esc(f.titulo || 'Informações para começar')}</h1>
  ${f.texto ? `<p class="lead pg-sub">${esc(f.texto)}</p>` : ''}

  <div class="pg-feito" id="feito"${respondido ? '' : ' hidden'}>
    <p class="pg-feito__t">Recebido. Obrigado!</p>
    <p>Já tenho tudo o que preciso para começar. Qualquer dúvida eu te chamo.</p>
  </div>

  <form id="form" class="pg-form"${respondido ? ' hidden' : ''} novalidate>
    ${blocos}
    <p class="pg-erro" id="erro" hidden></p>
    <div class="pg-acoes">
      <button class="btn btn--brand" type="submit" id="enviar">Enviar as informações</button>
      <span class="pg-nota">Suas respostas vão direto para o Samuel.</span>
    </div>
  </form>
</main>

<footer class="pg-rodape"><div class="wrap"><p class="small">Samuel Freire Web Designer</p></div></footer>

<script>
(function () {
  var form = document.getElementById('form');
  if (!form) return;
  var erro = document.getElementById('erro');
  var botao = document.getElementById('enviar');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    erro.hidden = true;
    // validação do navegador, mas com a mensagem no nosso tom
    if (!form.checkValidity()) {
      var falta = form.querySelector(':invalid');
      if (falta) { falta.focus(); falta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      erro.textContent = 'Falta responder um campo obrigatório.';
      erro.hidden = false;
      return;
    }
    botao.disabled = true; botao.textContent = 'Enviando...';
    try {
      var dados = {};
      new FormData(form).forEach(function (v, k) {
        // "marque mais de uma" manda a mesma chave várias vezes
        dados[k] = dados[k] === undefined ? v : [].concat(dados[k], v).join(', ');
      });
      var r = await fetch(location.pathname, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ respostas: dados }),
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.erro || 'Não consegui enviar. Tente de novo em instantes.');
      form.hidden = true;
      document.getElementById('feito').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      erro.textContent = x.message;
      erro.hidden = false;
      botao.disabled = false; botao.textContent = 'Enviar as informações';
    }
  });
})();
</script>
</body>
</html>`;
}
