/* ============================================================
   Contrato de prestação de serviços, a partir da proposta.

   O texto jurídico nunca é escrito pela IA. As cláusulas fixas
   moram no modelo (editável no painel); as que variam (prazo,
   preço, pagamento, hospedagem) saem de frases aprovadas, escolhidas
   por código a partir dos números da proposta. A IA só lê a proposta
   e a transcrição para dizer quem é o contratante, listar os
   serviços na linguagem do contrato e apontar o que faltou. Dado que
   ninguém informou vira "[PREENCHER: ...]", nunca um chute.

   Sem chave da OpenAI o contrato sai do mesmo jeito, só com mais
   lacunas para preencher à mão.
   ============================================================ */

import { pathToFileURL } from 'node:url';
import { temChaveIa, pedirJsonIa, semTravessao } from './proposta-ia.js';
import { contratanteDasRespostas } from './perguntas.js';

/* ---------- o modelo ----------
   Baseado no contrato mais recente (outubro de 2026). {{MARCA}} é
   trocada na geração; marca sozinha na linha e sem valor some. */
export const MODELO_PADRAO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS {{TITULO}}
PROJETO ÚNICO

CONTRATANTE
{{CONTRATANTE}}

CONTRATADA
Samuel Freire da Silva
CNPJ nº 51.932.524/0001-51 · samuelfreirebr@gmail.com

CONTRATANTE e CONTRATADA, em conjunto denominadas “PARTES”, celebram o presente Contrato de Prestação de Serviços de Design e Webdesign (“CONTRATO”), mediante as cláusulas abaixo.

1. OBJETO E ESCOPO
1.1. A CONTRATADA prestará à CONTRATANTE os seguintes serviços (doravante, “PROJETO”):
{{SERVICOS}}
1.2. Qualquer solicitação que amplie o escopo acima, incluindo novas páginas, funcionalidades, integrações ou materiais, dependerá de novo orçamento e prazo aprovados por escrito pelas PARTES.
1.3. Estão incluídas 3 rodadas de revisões após cada entrega. Após esse prazo, a CONTRATADA poderá, a seu critério, pausar qualquer alteração ainda em andamento, submetê-la a novo orçamento ou encerrá-la como concluída.
1.4. A CONTRATADA prestará os serviços de forma remota, com autonomia técnica e sem jornada fixa de trabalho.
{{1.5}}

2. PRAZO E APROVAÇÕES
{{2.1}}
2.2. Caso a CONTRATANTE atrase o envio de materiais, informações, acessos, aprovações ou respostas, o prazo será suspenso e prorrogado pelo período correspondente, sem penalidade à CONTRATADA.
2.3. A CONTRATANTE deverá aprovar cada entrega ou solicitar ajustes por escrito em até 3 (três) dias úteis após o recebimento. Sem resposta nesse prazo, a entrega será considerada aprovada.

3. PREÇO E PAGAMENTO
{{3.1}}
{{3.2}}
{{3.3}}
{{3.4}}

4. COMUNICAÇÃO E OBRIGAÇÕES
4.1. A CONTRATADA atenderá comunicações e reuniões em dias úteis, das 9h às 20h, no horário de Brasília, sem obrigação de atendimento fora desse período.
4.2. A CONTRATADA compromete-se a executar os serviços com qualidade técnica e dentro do escopo contratado.
4.3. A CONTRATANTE compromete-se a fornecer, em tempo hábil, todos os materiais, informações, textos, imagens, acessos e aprovações necessários ao PROJETO.
4.4. A CONTRATANTE é responsável pela legalidade, veracidade e autorização de uso de todo material, conteúdo, marca, texto, imagem ou informação que fornecer à CONTRATADA.
{{4.5}}

5. NATUREZA DA RELAÇÃO
5.1. Este CONTRATO não cria vínculo empregatício, societário, de representação, parceria, exclusividade ou subordinação entre as PARTES.
5.2. A CONTRATADA atua como prestadora de serviços independente, sendo responsável por seus próprios equipamentos, organização de trabalho e obrigações fiscais aplicáveis.
5.3. A CONTRATADA poderá prestar serviços a outros clientes, desde que isso não prejudique o cumprimento deste CONTRATO.

6. PROPRIEDADE INTELECTUAL
6.1. Após o pagamento integral, a CONTRATANTE receberá os direitos patrimoniais sobre as entregas finais produzidas especificamente para o PROJETO.
6.2. Permanecem de propriedade da CONTRATADA seus métodos, ferramentas, modelos, processos, bibliotecas, códigos, materiais preexistentes e conhecimentos técnicos.
6.3. Fontes, imagens, plugins, plataformas, licenças e demais elementos de terceiros seguem seus próprios termos de uso e não são transferidos além do permitido por esses termos.
6.4. A CONTRATADA poderá utilizar os materiais desenvolvidos em seu portfólio após sua divulgação pública pela CONTRATANTE, desde que não revele informações confidenciais.
6.5. O uso do nome, marca ou imagem de uma PARTE pela outra, fora das situações previstas neste CONTRATO, exige autorização prévia e escrita.

7. CONFIDENCIALIDADE E DADOS
7.1. Cada PARTE deverá manter em sigilo as informações comerciais, técnicas, financeiras e estratégicas recebidas da outra em razão deste CONTRATO, durante sua vigência e por 1 (um) ano após seu encerramento.
7.2. Caso a CONTRATADA tenha acesso a dados pessoais em nome da CONTRATANTE, deverá utilizá-los somente para executar o PROJETO e conforme as instruções da CONTRATANTE.
7.3. A CONTRATANTE é responsável pelas políticas de privacidade, cookies, consentimentos e demais obrigações legais relacionadas ao seu website, negócio e clientes.

8. RESPONSABILIDADE
8.1. A CONTRATADA não será responsável por falhas, indisponibilidades, atrasos ou alterações causadas por hospedagens, domínios, plataformas de pagamento, plataformas, plugins, serviços de terceiros, mecanismos de busca ou materiais fornecidos pela CONTRATANTE.
8.2. A CONTRATADA não garante resultados comerciais, vendas, geração de leads, posicionamento em buscadores ou desempenho de plataformas de terceiros.
8.3. Exceto por obrigação de pagamento ou ato comprovadamente doloso, nenhuma PARTE responderá por lucros cessantes, danos indiretos, perda de oportunidade ou danos consequenciais.
8.4. A responsabilidade total da CONTRATADA, se aplicável, ficará limitada ao valor efetivamente pago pela CONTRATANTE neste CONTRATO.

9. RESCISÃO
9.1. Qualquer PARTE poderá rescindir este CONTRATO mediante aviso escrito.
9.2. A rescisão produzirá efeitos em 5 (cinco) dias corridos após o recebimento do aviso, salvo em caso de descumprimento grave não corrigido nesse prazo.
9.3. Encerrado o CONTRATO, a CONTRATADA entregará os materiais correspondentes ao trabalho efetivamente pago e cessará o uso de informações confidenciais da CONTRATANTE.

10. COMUNICAÇÕES E ASSINATURA
10.1. Avisos, aprovações, solicitações e alterações deste CONTRATO serão válidos quando feitos por escrito, inclusive por e-mail, WhatsApp ou outro canal de comunicação aceito pelas PARTES.
10.2. Este CONTRATO poderá ser assinado eletronicamente e produzirá todos os seus efeitos legais.

11. LEI APLICÁVEL E FORO
11.1. Este CONTRATO será regido pelas leis da República Federativa do Brasil.
11.2. As PARTES buscarão resolver amigavelmente eventuais conflitos. Não sendo possível, fica eleito o foro da comarca de João Pessoa, Paraíba, Brasil, com renúncia a qualquer outro, por mais privilegiado que seja.

{{LOCAL_DATA}}

CONTRATANTE
____________________________________
{{ASSINANTE}}

CONTRATADA
____________________________________
Samuel Freire da Silva
`;

/* ---------- número por extenso ----------
   Inteiros de 0 a 999.999, que cobre prazo e valor de contrato. */
const UNI = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
  if (n === 100) return 'cem';
  const partes = [];
  if (n >= 100) partes.push(CEN[Math.floor(n / 100)]);
  const r = n % 100;
  if (r >= 20) partes.push(DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNI[r % 10] : ''));
  else if (r > 0 || n === 0) partes.push(UNI[r]);
  return partes.join(' e ');
}

export function porExtenso(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n > 999999) return String(n);
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000), resto = n % 1000;
  const cabeca = (mil === 1 ? '' : ate999(mil) + ' ') + 'mil';
  if (!resto) return cabeca;
  // "mil e cem", "dois mil e cinco", mas "mil duzentos e trinta"
  return cabeca + (resto < 100 || resto % 100 === 0 ? ' e ' : ' ') + ate999(resto);
}

/* ---------- dinheiro ---------- */
const MOEDAS = {
  'R$': { simbolo: 'R$', local: 'pt-BR', um: 'real', varios: 'reais', nome: 'reais' },
  $: { simbolo: 'US$', local: 'en-US', um: 'dólar americano', varios: 'dólares americanos', nome: 'dólares americanos' },
  '€': { simbolo: '€', local: 'pt-BR', um: 'euro', varios: 'euros', nome: 'euros' },
};

// "R$ 2.000,00 (dois mil reais)"
export function valorPorExtenso(valor, moeda) {
  const m = MOEDAS[moeda] || MOEDAS['R$'];
  const inteiro = Math.floor(valor), centavos = Math.round((valor - inteiro) * 100);
  const numero = m.simbolo + ' ' + new Intl.NumberFormat(m.local, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
  let extenso = porExtenso(inteiro) + ' ' + (inteiro === 1 ? m.um : m.varios);
  if (centavos) extenso += ' e ' + porExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  return `${numero} (${extenso})`;
}

/* ---------- as cláusulas que variam ----------
   Frases dos contratos já assinados. O código só escolhe a variante
   (à vista ou parcelado, real ou outra moeda) e encaixa os números. */
const FALTA = (o) => `[PREENCHER: ${o}]`;

function clausulas(p, modelo, ia) {
  const inv = p.investimento || {};
  const parcelas = Math.max(1, Math.round(Number(inv.parcelas) || 1));
  const valorParcela = Number(inv.valorParcela) || 0;
  const moeda = MOEDAS[inv.moeda] ? inv.moeda : 'R$';
  const aVista = parcelas === 1;
  const total = valorPorExtenso(parcelas * valorParcela, moeda);
  const parcela = valorPorExtenso(valorParcela, moeda);

  const dias = Number(ia?.prazoDias) || Number((/(\d+)\s*dias/i.exec((p.condicoes || []).map((c) => c.titulo + ' ' + c.texto).join(' ')) || [])[1]) || 0;
  const prazo = dias ? `${dias} (${porExtenso(dias)})` : FALTA('prazo em dias úteis');
  const gatilho = aVista ? 'do valor' : 'da primeira parcela';

  let c31;
  if (!valorParcela) c31 = `Pelo PROJETO, a CONTRATANTE pagará o valor total de ${FALTA('valor e forma de pagamento')}.`;
  else if (aVista) c31 = `Pelo PROJETO, a CONTRATANTE pagará à CONTRATADA o valor total de ${total}, em parcela única, com pagamento como condição para o início dos trabalhos.`;
  else if (parcelas === 2) c31 = `Pelo PROJETO, a CONTRATANTE pagará o valor total de ${total}, em duas parcelas de ${parcela} cada: a) primeira parcela, na assinatura deste CONTRATO, como condição para início dos trabalhos; e b) segunda parcela, que vencerá quando a CONTRATADA entregar uma versão final, funcional quando aplicável, e utilizável de cada item descrito na Cláusula 1. Os ajustes posteriores previstos no item 1.3 não suspendem, adiam ou condicionam esse pagamento.`;
  else c31 = `Pelo PROJETO, a CONTRATANTE pagará o valor total de ${total}, em ${parcelas} (${porExtenso(parcelas)}) parcelas de ${parcela} cada: a primeira na assinatura deste CONTRATO, como condição para início dos trabalhos, e as demais ${FALTA('vencimento das demais parcelas')}. Os ajustes posteriores previstos no item 1.3 não suspendem, adiam ou condicionam esse pagamento.`;

  const conta = String(modelo.contaReais || '').trim();
  const c32 = moeda === 'R$'
    ? (conta ? `O pagamento será realizado em reais, por PIX ou transferência bancária para a conta da CONTRATADA: ${conta.replace(/\.$/, '')}.`
      : 'O pagamento será realizado em reais, pelo meio de pagamento indicado pela CONTRATADA.')
    : `O pagamento será realizado em ${MOEDAS[moeda].nome}, pelo meio de pagamento internacional indicado pela CONTRATADA. Custos de envio, tarifas da plataforma e encargos necessários para que a CONTRATADA receba o valor integral serão de responsabilidade da CONTRATANTE.`;

  const hospedagem = ia?.hospedagem || (/\b(site|web|landing|loja|blog|página)/i.test((p.escopo || []).map((e) => e.titulo).join(' ')) ? 'cliente' : 'nenhuma');

  return {
    1.5: { cliente: 'A hospedagem necessária para o PROJETO será de responsabilidade exclusiva da CONTRATANTE, incluindo sua contratação, pagamento, renovação e gestão da respectiva conta.',
      suporte: 'Após a entrega, a CONTRATADA prestará suporte para correção de erros, alterações pontuais de texto e instalação de ferramentas e automações, quando necessárias, relacionadas ao PROJETO. Novas páginas, funcionalidades ou mudanças de escopo seguem a Cláusula 1.2.',
      nenhuma: '' }[hospedagem] || '',
    2.1: `O prazo para a entrega da primeira versão dos itens previstos na Cláusula 1 é de até ${prazo} dias úteis, contados somente após a confirmação do pagamento ${gatilho} e o recebimento de todas as informações, materiais, textos, imagens e demais elementos necessários à execução do PROJETO. O prazo para conclusão definitiva do PROJETO será ajustado conforme o período necessário para análise, solicitação e execução das revisões previstas na Cláusula 1.3, não sendo as rodadas de revisão consideradas parte do prazo de ${prazo} dias úteis para a primeira entrega.`,
    3.1: c31,
    3.2: c32,
    3.3: aVista
      ? 'Em caso de atraso no pagamento, a CONTRATADA poderá suspender o início ou a continuidade dos serviços até a regularização, sem prejuízo de multa de 2% sobre o valor em atraso e juros de 1% ao mês.'
      : 'Em caso de atraso superior a 10 (dez) dias úteis, a CONTRATADA poderá suspender os serviços até a regularização do pagamento, sem prejuízo de multa de 2% sobre o valor em atraso e juros de 1% ao mês.',
    3.4: aVista
      ? 'O valor pago não será reembolsável após o início dos trabalhos. Caso a CONTRATANTE cancele o PROJETO após seu início, não haverá restituição do valor pago, sem prejuízo da responsabilidade da CONTRATANTE pelo pagamento de eventuais valores adicionais decorrentes de trabalhos solicitados e executados que não estejam contemplados no escopo originalmente contratado.'
      : 'A primeira parcela não será reembolsável após o início dos trabalhos. Caso a CONTRATANTE cancele o PROJETO após seu início, continuará responsável pelo pagamento proporcional ao trabalho já executado que ultrapassar o valor da primeira parcela.',
    4.5: ia?.terceiros ? 'A contratação e o pagamento da hospedagem, do domínio e de plataformas de terceiros necessárias ao funcionamento do site são de responsabilidade da CONTRATANTE, pagos diretamente aos respectivos fornecedores.' : '',
  };
}

/* ---------- a IA: quem é o cliente e o que foi contratado ---------- */
const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['tituloServicos', 'contratante', 'servicos', 'prazoDias', 'hospedagem', 'terceiros', 'assinante', 'faltando'],
  properties: {
    tituloServicos: { type: 'string', enum: ['DE DESIGN', 'DE DESIGN E WEBDESIGN'] },
    contratante: { type: 'array', items: { type: 'string' } },
    servicos: { type: 'array', items: { type: 'string' } },
    prazoDias: { type: 'integer' },
    hospedagem: { type: 'string', enum: ['cliente', 'suporte', 'nenhuma'] },
    terceiros: { type: 'boolean' },
    assinante: { type: 'string' },
    faltando: { type: 'array', items: { type: 'string' } },
  },
};

const SISTEMA = `Você prepara os dados variáveis de um contrato de prestação de serviços de design e webdesign de Samuel Freire. As cláusulas jurídicas já existem e NÃO são com você. Você recebe a proposta comercial aprovada e, quando houver, a transcrição da reunião com o cliente, e devolve só os campos do esquema, em português do Brasil.

Campos:
- tituloServicos: "DE DESIGN E WEBDESIGN" se o projeto inclui site, loja, landing page ou sistema; "DE DESIGN" se é só identidade visual, folder, impresso ou criativos.
- contratante: linhas de identificação do cliente, uma informação por linha. A primeira é o nome ou a razão social. Depois, só o que constar no material: "Responsável: Nome · CPF nº ...", "CNPJ nº ..." (ou "EIN nº ..." para empresa dos Estados Unidos), "E-mail: ...", "Endereço: ...". Documento, e-mail e endereço que NÃO aparecerem no material viram uma linha "[PREENCHER: CPF ou CNPJ]", "[PREENCHER: e-mail]", "[PREENCHER: endereço]". Nunca invente número, e-mail ou endereço.
- servicos: os serviços contratados, um por item, na linguagem de contrato, a partir dos entregáveis da proposta. Exemplos: "Criação de site para venda de produtos (loja virtual), com páginas de produto, integração com plataforma de pagamento (checkout), configuração de domínio personalizado e SEO básico." ou "Design de folder comercial para apresentação de orçamentos." Não acrescente serviço que não está na proposta.
- prazoDias: o prazo em dias úteis combinado para a primeira entrega. Use o da proposta; se a reunião combinou outro, use o da reunião. 0 se não houver.
- hospedagem: "cliente" quando há site e a hospedagem fica por conta do cliente; "suporte" quando a proposta ou a reunião prometem suporte depois da entrega; "nenhuma" quando não há site.
- terceiros: true quando o site depende de domínio, hospedagem ou plataforma de terceiros pagos pelo cliente (loja virtual, checkout, plugins).
- assinante: o nome que vai na linha de assinatura do contratante (a razão social ou o nome da pessoa).
- faltando: lista curta do que você não encontrou e Samuel precisa conferir ou pedir ao cliente.

Nunca use travessão (o caractere de traço longo). Use vírgula, dois-pontos ou ponto.`;

function resumoDaProposta(p) {
  const inv = p.investimento || {};
  return `Proposta aprovada:
- cliente: ${p.cliente || ''}
- preparada para: ${p.preparadaPara || ''}
- entregáveis: ${(p.escopo || []).map((e) => `${e.titulo}${e.descricao ? ' (' + e.descricao + ')' : ''}`).join(' | ')}
- investimento: ${inv.parcelas || 1}x ${inv.moeda || 'R$'} ${inv.valorParcela || 0}
- condições: ${(p.condicoes || []).map((c) => `${c.titulo}: ${c.texto}`).join(' | ')}`;
}

/* ---------- montar ---------- */
function hojeNoBrasil() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function montar(modeloTexto, campos) {
  return String(modeloTexto || MODELO_PADRAO).split('\n').map((linha) => {
    if (!linha.includes('{{')) return linha;
    const nova = linha.replace(/\{\{([^}]+)\}\}/g, (_, nome) => {
      const v = campos[nome.trim()];
      return v === undefined ? FALTA(nome.trim()) : v;
    });
    return nova.trim() ? nova : null;   // marca opcional sem valor: a linha some
  }).filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function gerarContrato({ proposta, transcricao, modelo, respostas }) {
  const p = proposta || {};
  const avisos = [];
  let ia = null, usado = null;

  if (temChaveIa()) {
    const partes = [{ type: 'input_text', text: resumoDaProposta(p) }];
    if (transcricao) partes.push({ type: 'input_text', text: `--- Transcrição da reunião ---\n${String(transcricao).slice(0, 60000)}` });
    try {
      const r = await pedirJsonIa(partes, { sistema: SISTEMA, esquema: ESQUEMA, nome: 'dados_do_contrato' });
      ia = r.ia; usado = r.modelo;
    } catch (e) { avisos.push('A IA não respondeu (' + e.message + '). O contrato saiu só com os dados da proposta.'); }
  } else {
    avisos.push('IA desligada (sem OPENAI_API_KEY): o contrato saiu só com os dados da proposta.');
  }

  const doBriefing = contratanteDasRespostas(respostas);
  if (doBriefing) avisos.push('Dados do contratante vieram do briefing respondido pelo cliente.');
  const nome = doBriefing?.[0] || p.preparadaPara || p.cliente || FALTA('nome do contratante');
  const servicos = (ia?.servicos?.length ? ia.servicos : (p.escopo || []).map((e) => e.titulo + (e.descricao ? ': ' + e.descricao : ''))).filter(Boolean);
  const campos = {
    TITULO: ia?.tituloServicos || 'DE DESIGN E WEBDESIGN',
    // Resposta do cliente ganha da IA: foi ele quem informou.
    CONTRATANTE: (doBriefing || (ia?.contratante?.length ? ia.contratante : [nome, FALTA('CPF ou CNPJ'), FALTA('e-mail'), FALTA('endereço')])).join('\n'),
    SERVICOS: servicos.length ? servicos.map((s) => String(s).replace(/[.;]\s*$/, '')).map((s, i, l) => s + (i === l.length - 1 ? '.' : ';')).join('\n') : FALTA('serviços contratados'),
    LOCAL_DATA: `João Pessoa, PB, ${hojeNoBrasil()}.`,
    ASSINANTE: respostas?.responsavel?.trim() || ia?.assinante || nome,
  };
  for (const [n, t] of Object.entries(clausulas(p, modelo || {}, ia))) campos[n] = t ? `${n}. ${t}` : '';

  const texto = semTravessao(montar(modelo?.texto, campos));
  for (const f of ia?.faltando || []) avisos.push(semTravessao(f));
  const lacunas = (texto.match(/\[PREENCHER/g) || []).length;
  if (lacunas) avisos.unshift(`${lacunas} ${lacunas === 1 ? 'ponto marcado' : 'pontos marcados'} com [PREENCHER] para completar antes de enviar.`);
  return { texto, avisos, modelo: usado };
}

/* ---------- a página (vira o PDF pela impressão) ---------- */
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const comLacunas = (t) => esc(t).replace(/\[PREENCHER[^\]]*\]/g, '<mark>$&</mark>');

export function renderizarContrato(texto, { titulo = 'Contrato', imprimir = false } = {}) {
  const linhas = String(texto || '').split('\n');
  const inicio = linhas.findIndex((l) => l.trim());
  const corpo = linhas.map((l, i) => {
    const t = l.trim();
    if (!t) return '';
    if (i === inicio) return `<h1>${esc(t)}</h1>`;
    if (/^_{5,}$/.test(t)) return '<p class="ct-linha"></p>';
    if (/^\d+\.\s+[^a-zà-ú]+$/.test(t)) return `<h2>${esc(t)}</h2>`;
    if (/^(CONTRATANTE|CONTRATADA|PROJETO ÚNICO)$/.test(t)) return `<p class="ct-rot">${esc(t)}</p>`;
    const m = /^(\d+\.\d+\.)\s+(.*)$/.exec(t);
    if (m) return `<p class="ct-item"><b>${m[1]}</b> ${comLacunas(m[2])}</p>`;
    return `<p>${comLacunas(t)}</p>`;
  }).join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/base.css">
<link rel="stylesheet" href="/styles/contrato.css?v=c1">
<link rel="icon" href="/img/favicon.png">
</head>
<body class="contrato">
<div class="ct-barra">
  <p>Na janela de impressão, escolha "Salvar como PDF".</p>
  <button class="btn btn--brand" type="button" onclick="window.print()">Imprimir ou salvar em PDF</button>
</div>
<main class="ct-folha">
${corpo}
</main>
${imprimir ? '<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 150); });</script>' : ''}
</body>
</html>`;
}

/* ---------- conferência ----------
   node servidor/contrato.js  roda as contas do extenso e da montagem. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { strict: assert } = await import('node:assert');
  assert.equal(porExtenso(10), 'dez');
  assert.equal(porExtenso(100), 'cem');
  assert.equal(porExtenso(659), 'seiscentos e cinquenta e nove');
  assert.equal(porExtenso(1000), 'mil');
  assert.equal(porExtenso(1100), 'mil e cem');
  assert.equal(porExtenso(2005), 'dois mil e cinco');
  assert.equal(porExtenso(5897), 'cinco mil oitocentos e noventa e sete');
  assert.equal(porExtenso(21000), 'vinte e um mil');
  assert.equal(valorPorExtenso(2000, 'R$').replace(/\s/g, ' '), 'R$ 2.000,00 (dois mil reais)');
  assert.equal(valorPorExtenso(1100, '$'), 'US$ 1,100.00 (mil e cem dólares americanos)');
  assert.equal(valorPorExtenso(1, 'R$').replace(/\s/g, ' '), 'R$ 1,00 (um real)');
  assert.equal(valorPorExtenso(1500.5, 'R$').replace(/\s/g, ' '), 'R$ 1.500,50 (mil e quinhentos reais e cinquenta centavos)');
  assert.equal(montar('a\n{{X}}\nb {{Y}}', { X: '', Y: 'c' }), 'a\nb c');
  assert.equal(montar('{{Z}}', {}), '[PREENCHER: Z]');
  console.log('contrato.js: tudo certo');
}
