/* ============================================================
   O que recriar, negócio por negócio.

   Antes todo cartão dizia a mesma frase ("página de uma dobra
   com prova e botão"). Aqui o plano nasce do que a varredura
   sabe daquele negócio: o nicho, o que as opiniões elogiam ou
   reclamam, o que falta no perfil do Google, o que o site tem
   de errado e como a pessoa pode ser contatada.

   Sai daqui:
     { titulo, resumo, prazo, itens[{icone,titulo,texto}],
       destaques{termos,elogio,queixa} }

   Sem IA e sem chave: é leitura de texto e regra escrita.
   ============================================================ */

/* ---------- opiniões: o que os clientes repetem ---------- */

const VAZIAS = new Set(['para', 'pela', 'pelo', 'como', 'mais', 'muito', 'sempre', 'todos', 'todas', 'aqui', 'onde', 'quando', 'porque', 'esse', 'essa', 'este', 'esta', 'isso', 'aquele', 'foram', 'fomos', 'estou', 'estava', 'tenho', 'temos', 'fiquei', 'ficou', 'super', 'bastante', 'gente', 'lugar', 'pessoas', 'pessoa', 'vezes', 'coisa', 'tudo', 'nada', 'bem', 'mesmo', 'ainda', 'depois', 'antes', 'the', 'and', 'was', 'were', 'they', 'very', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'but', 'for', 'all', 'you', 'our', 'their', 'would', 'just', 'get', 'got', 'will', 'can', 'are', 'not', 'his', 'her', 'she', 'him', 'them', 'been', 'what', 'when', 'there', 'here', 'about', 'also', 'than', 'then', 'them', 'para', 'muy', 'que', 'los', 'las', 'una', 'por', 'con', 'del', 'este', 'esta']);

/* O que o cliente elogia, em uma palavra. Cada termo carrega o
   rótulo que vai pra tela, porque "atendimento" e "attentive"
   são a mesma coisa pro dono do negócio. */
const TEMAS = [
  [/atend|attent|service|friendly|amável|amavel|educad|cordial|polite/i, 'atendimento'],
  [/pontual|no prazo|on time|prazo|rápid|rapid|quick|fast|agilid|puntual/i, 'pontualidade'],
  [/preço|preco|valor|price|barato|justo|affordable|fair|honest|honest|precio/i, 'preço justo'],
  [/limp|clean|organiz|caprich|tidy|neat/i, 'capricho e limpeza'],
  [/qualidade|quality|acabamento|finish|bem feito|well done|excellent|excelente|perfeito|perfect/i, 'qualidade do acabamento'],
  [/profissional|professional|competente|expert|conhecimento|knowledge/i, 'competência técnica'],
  [/confiança|confianca|trust|honesto|honest|sincero|reliable|confiar/i, 'confiança'],
  [/recomend|indico|indicaria|recommend|voltarei|again/i, 'indicação'],
  [/garantia|warranty|resolveu|solved|fixed|consertou|resolvi/i, 'resolveu o problema'],
  [/atrasa|atraso|late|demor|delay|sumiu|não apareceu|nao apareceu|no show/i, 'atraso'],
  [/caro|expensive|cobrou a mais|overcharg|abusiv/i, 'preço alto'],
  [/mal educ|rude|grosso|despreparad|unprofessional|péssimo|pessimo|horrible|terrible/i, 'tratamento ruim'],
  [/refaz|voltou|retrabalho|leak|vazou|quebrou|broke|problema de novo/i, 'retrabalho'],
];
const RUINS = new Set(['atraso', 'preço alto', 'tratamento ruim', 'retrabalho']);

const cru = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Uma frase curta de opinião, que serve de depoimento na página. */
function frase(texto) {
  const partes = String(texto || '').split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter((f) => f.length >= 25 && f.length <= 130);
  return partes[0] || '';
}

export function destaques(opinioes = []) {
  const termos = new Map();
  let elogio = '', queixa = '';
  for (const o of opinioes) {
    const t = String(o || '');
    if (!t.trim()) continue;
    let ruim = false;
    for (const [re, nome] of TEMAS) {
      if (!re.test(t)) continue;
      termos.set(nome, (termos.get(nome) || 0) + 1);
      if (RUINS.has(nome)) ruim = true;
    }
    const f = frase(t);
    if (!f) continue;
    if (ruim && !queixa) queixa = f;
    else if (!ruim && !elogio) elogio = f;
  }
  // Palavra repetida que não está na lista de temas ainda conta:
  // é o vocabulário do próprio cliente, bom pra usar na página.
  const contagem = new Map();
  for (const o of opinioes) {
    for (const p of cru(o).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)) {
      if (p.length < 5 || VAZIAS.has(p)) continue;
      contagem.set(p, (contagem.get(p) || 0) + 1);
    }
  }
  const soltas = [...contagem.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p);
  const lista = [...termos.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  return { termos: [...new Set([...lista, ...soltas])].slice(0, 4), elogio, queixa, ruim: lista.some((t) => RUINS.has(t)) };
}

/* ---------- blocos que cada tipo de negócio precisa ---------- */

/* Por grupo de nicho. Cada bloco é o que falta na página de quem
   vende isso, na ordem em que o cliente pergunta. */
const POR_GRUPO = {
  obra: [
    { icone: 'antes', titulo: 'Antes e depois', texto: 'Galeria com seis a dez obras entregues, cada uma com o antes ao lado do depois. É o que substitui o orçamento na cabeça de quem está decidindo.' },
    { icone: 'orcamento', titulo: 'Pedido de orçamento com foto', texto: 'Formulário de três campos (o que precisa, onde é, foto do lugar). Chega no WhatsApp já com a imagem, e o primeiro contato vira visita marcada.' },
    { icone: 'mapa', titulo: 'Área atendida', texto: 'Lista das cidades e bairros que vocês atendem, escrita na página. É o que faz aparecer nas buscas de quem mora perto.' },
    { icone: 'escudo', titulo: 'Licença, seguro e garantia', texto: 'Registro, seguro e prazo de garantia em destaque. Quem contrata obra procura isso antes do preço.' },
  ],
  saude: [
    { icone: 'agenda', titulo: 'Agendamento direto', texto: 'Botão de marcar consulta que cai no WhatsApp com a data escolhida, sem o vai e volta de mensagem.' },
    { icone: 'lista', titulo: 'O que trata, em palavras de paciente', texto: 'Lista de queixas do jeito que a pessoa busca, não pelo nome técnico do procedimento.' },
    { icone: 'prova', titulo: 'Quem atende', texto: 'Foto, formação e registro do profissional. Em saúde, a confiança vem de ver a pessoa antes de sentar na cadeira.' },
    { icone: 'relogio', titulo: 'Convênios e horário', texto: 'Convênios aceitos e horário de atendimento na primeira tela, que é a dúvida que mais faz ligar.' },
  ],
  beleza: [
    { icone: 'foto', titulo: 'Galeria de trabalhos', texto: 'Doze fotos dos trabalhos, organizadas por serviço. É o portfólio que hoje está preso no feed.' },
    { icone: 'preco', titulo: 'Tabela de serviços e preços', texto: 'Serviço, tempo e faixa de preço. Quem não vê preço pergunta no direct e, se demora, marca em outro lugar.' },
    { icone: 'agenda', titulo: 'Agendamento online', texto: 'Horário escolhido na página e confirmado no WhatsApp, inclusive de madrugada.' },
  ],
  alimentacao: [
    { icone: 'cardapio', titulo: 'Cardápio que abre rápido', texto: 'Cardápio em texto na própria página, não em PDF nem em foto. PDF no celular é o jeito mais rápido de perder o pedido.' },
    { icone: 'zap', titulo: 'Pedido e reserva', texto: 'Botão de pedido (WhatsApp ou aplicativo) e reserva de mesa, um toque cada.' },
    { icone: 'relogio', titulo: 'Horário e endereço visíveis', texto: 'Horário de hoje, endereço e mapa logo na primeira tela.' },
  ],
  auto: [
    { icone: 'orcamento', titulo: 'Orçamento por foto', texto: 'O cliente manda a foto do carro e o que houve; o orçamento sai no WhatsApp sem ele sair de casa.' },
    { icone: 'lista', titulo: 'Serviços por categoria', texto: 'O que vocês fazem, separado por tipo de serviço, com o tempo médio de cada um.' },
    { icone: 'escudo', titulo: 'Garantia e peça usada', texto: 'Prazo de garantia e a origem das peças escritos na página. É a desconfiança número um do setor.' },
  ],
  pet: [
    { icone: 'preco', titulo: 'Serviços e preços por porte', texto: 'Banho, tosa e consulta com o preço por porte do animal, que é o que mais se pergunta.' },
    { icone: 'foto', titulo: 'Fotos dos bichos atendidos', texto: 'Galeria dos atendimentos, com autorização do dono. É a prova de cuidado que nenhum texto dá.' },
    { icone: 'agenda', titulo: 'Agendamento e leva e traz', texto: 'Marcar horário pela página e dizer se tem busca e entrega.' },
  ],
  fitness: [
    { icone: 'agenda', titulo: 'Aula experimental', texto: 'Botão de marcar a aula experimental, com data e horário, direto no WhatsApp.' },
    { icone: 'relogio', titulo: 'Grade de horários', texto: 'A grade de aulas na página, atualizável sem mexer no código.' },
    { icone: 'preco', titulo: 'Planos e valores', texto: 'Planos com o que cada um inclui. Sem valor na página, o contato só serve pra perguntar preço.' },
  ],
  servicos: [
    { icone: 'prova', titulo: 'Casos e resultados', texto: 'Três casos com o problema, o que foi feito e o resultado em número. Serviço para empresa se vende por resultado, não por adjetivo.' },
    { icone: 'orcamento', titulo: 'Formulário de diagnóstico', texto: 'Formulário curto que já qualifica: tamanho da empresa, o que precisa, urgência.' },
    { icone: 'escudo', titulo: 'Quem assina o trabalho', texto: 'Registro profissional, tempo de mercado e a equipe. É o que separa do concorrente sem rosto.' },
  ],
  educacao: [
    { icone: 'lista', titulo: 'Turmas, horários e matrícula', texto: 'Cursos, turmas e como se matricular, sem PDF e sem "entre em contato para saber mais".' },
    { icone: 'prova', titulo: 'Depoimentos de aluno e responsável', texto: 'Três depoimentos com nome e foto. Matrícula é decisão de família, e família confia em família.' },
    { icone: 'preco', titulo: 'Valores e formas de pagamento', texto: 'Mensalidade e material, com as formas de pagamento.' },
  ],
  eventos: [
    { icone: 'foto', titulo: 'Portfólio por tipo de evento', texto: 'Galeria separada por tipo de festa, com o espaço cheio e montado.' },
    { icone: 'agenda', titulo: 'Consulta de data', texto: 'O cliente escolhe a data na página e já descobre se está livre. É a primeira pergunta de todo evento.' },
    { icone: 'orcamento', titulo: 'Orçamento por número de convidados', texto: 'Formulário com data, número de pessoas e tipo de evento, que chega pronto no WhatsApp.' },
  ],
  imovel: [
    { icone: 'lista', titulo: 'Vitrine dos imóveis', texto: 'Imóveis com foto, bairro, metragem e valor, filtráveis na própria página.' },
    { icone: 'orcamento', titulo: 'Avaliação gratuita', texto: 'Formulário de avaliação para quem quer vender. É o lado que dá estoque à imobiliária.' },
    { icone: 'mapa', titulo: 'Bairros que vocês dominam', texto: 'Página por bairro, que é como o comprador procura de verdade.' },
  ],
  varejo: [
    { icone: 'foto', titulo: 'Vitrine dos produtos', texto: 'Os produtos mais vendidos com foto e preço, e o botão que leva o pedido pro WhatsApp.' },
    { icone: 'relogio', titulo: 'Horário, endereço e estacionamento', texto: 'Informação de loja física resolvida na primeira tela.' },
    { icone: 'zap', titulo: 'Catálogo no WhatsApp', texto: 'Link que abre a conversa já com o produto escolhido.' },
  ],
  turismo: [
    { icone: 'foto', titulo: 'Fotos dos quartos e do café', texto: 'Galeria por acomodação, com o que cada uma inclui.' },
    { icone: 'agenda', titulo: 'Reserva direta', texto: 'Botão de reserva sem intermediário, que economiza a comissão do site de reservas.' },
    { icone: 'mapa', titulo: 'O que tem por perto', texto: 'Distância das atrações, que é o que decide entre duas pousadas iguais.' },
  ],
};

const PADRAO = [
  { icone: 'lista', titulo: 'O que vocês fazem, em uma frase', texto: 'Serviço, para quem e onde, escrito na primeira linha da página.' },
  { icone: 'prova', titulo: 'Prova social', texto: 'Avaliações e depoimentos em destaque, no lugar onde a pessoa decide.' },
  { icone: 'zap', titulo: 'Contato de um toque', texto: 'WhatsApp fixo na tela e formulário curto, para quem prefere escrever.' },
];

/* Serviço de urgência: quem chama encanador às onze da noite não lê
   página institucional, procura telefone e "atende agora". */
const URGENCIA = new Set(['encanador', 'eletricista', 'chaveiro', 'guincho', 'sinistro', 'climatizacao', 'telhado', 'dedetizacao', 'eletrodomesticos', 'entulho']);

/* ---------- o plano ---------- */

const nomeCurto = (n) => String(n.nome || 'o negócio').replace(/[|:].*$/, '').trim().slice(0, 40);

export function plano(n = {}, ctx = {}) {
  const d = n.diag || null;
  const perfil = n.perfil || null;
  const av = Number(n.avaliacoes) || 0;
  const nota = Number(n.nota) || 0;
  const dest = destaques(n.opinioes || []);
  const grupo = ctx.grupo || '';
  const nicho = ctx.nicho || '';
  // O OpenStreetMap devolve a tag crua ("bakery"), que não serve de
  // chamada. Aí vale o nome do nicho, que está na língua do painel.
  const tipoBruto = n.fonte === 'osm' ? (ctx.nichoNome || n.tipo) : (n.tipo || ctx.nichoNome);
  const oQueE = String(tipoBruto || 'o serviço').replace(/_/g, ' ').toLowerCase();
  const cidade = String(ctx.cidade || '').split(',')[0].trim();
  const itens = [];
  const juntar = (icone, titulo, texto) => itens.push({ icone, titulo, texto });

  /* 1. a primeira tela, escrita com o que este negócio tem */
  const ondeChega = n.semSite ? 'Hoje quem procura no Google encontra só a ficha do Maps.' : 'Hoje a primeira tela não diz isso em uma frase.';
  juntar('tela', 'Primeira tela',
    `"${oQueE.charAt(0).toUpperCase() + oQueE.slice(1)}${cidade ? ' em ' + cidade : ''}" com o nome de ${nomeCurto(n)}, uma foto do trabalho real e o botão de contato acima da dobra. ${ondeChega}`);

  /* 2. a prova que este negócio já tem no Google */
  if (av >= 100) {
    juntar('prova', 'As avaliações viram bloco de prova',
      `São ${av} avaliações${nota ? ' com média ' + String(nota).replace('.', ',') : ''} presas dentro do Google. Três delas na página, com nome e data, valem mais que qualquer texto de vendas.`);
  } else if (av >= 10) {
    juntar('prova', 'Trazer as avaliações pra página',
      `As ${av} avaliações${nota ? ' (média ' + String(nota).replace('.', ',') + ')' : ''} ficam só no Maps. Na página elas aparecem no momento da decisão, ao lado do botão.`);
  } else if (av > 0) {
    juntar('prova', 'Pedir avaliação e mostrar o que tem',
      `Só ${av} avaliações no Google. A página entra com depoimento escrito de cliente antigo e um pedido de avaliação depois do serviço.`);
  } else {
    juntar('prova', 'Construir a primeira prova',
      'Nenhuma avaliação no Google ainda. A página começa com fotos de trabalho entregue, tempo de mercado e nome de quem atende, que é a prova possível hoje.');
  }

  /* 3. o que as opiniões dizem, na voz do cliente */
  if (dest.elogio) {
    juntar('citacao', 'Frase de cliente na abertura',
      `As opiniões do Google já escreveram a chamada: "${dest.elogio}". Essa frase vai pro topo, com crédito.`);
  }
  if (dest.termos.length) {
    juntar('etiqueta', 'O que repetem sobre vocês',
      `As opiniões citam ${dest.termos.slice(0, 3).join(', ')}. Cada um vira um bloco curto da página, com a mesma palavra que o cliente usou.`);
  }
  if (dest.queixa || (nota && nota < 4.2 && av >= 5)) {
    juntar('alerta', 'Responder a crítica antes que ela apareça',
      dest.queixa
        ? `Tem reclamação pública ("${dest.queixa}"). A página responde isso de frente: prazo escrito, garantia e o que acontece se der errado.`
        : `Média ${String(nota).replace('.', ',')} no Google. A página precisa de prazo, garantia e canal de reclamação visíveis, senão a nota decide sozinha.`);
  }

  /* 4. os blocos do nicho */
  const doNicho = POR_GRUPO[grupo] || PADRAO;
  for (const b of doNicho) juntar(b.icone, b.titulo, b.texto);
  if (URGENCIA.has(nicho)) {
    juntar('raio', 'Chamada de urgência',
      'Faixa de "atendimento de emergência" com telefone gigante e clicável no topo. Nesse nicho, metade da procura acontece fora do horário comercial.');
  }

  /* 5. o que o site atual erra, item por item */
  if (d?.problemas?.length) {
    const graves = d.problemas.filter((p) => p.chave !== 'fora' && p.chave !== 'erro').sort((a, b) => b.peso - a.peso).slice(0, 3);
    for (const p of graves) juntar('conserto', 'Consertar no site atual', p.texto + '.');
  }
  if (d?.recursos) {
    const r = d.recursos;
    if (!r.depoimentos && av >= 10) juntar('conserto', 'O site não mostra nenhuma avaliação', 'A prova mais forte do negócio está fora da página.');
    if (!r.galeria && (grupo === 'obra' || grupo === 'beleza' || grupo === 'eventos' || grupo === 'auto')) juntar('conserto', 'O site não tem galeria', 'Nesse nicho, quem não mostra o trabalho feito só compete por preço.');
    if (!r.precos && (grupo === 'beleza' || grupo === 'fitness' || grupo === 'educacao' || grupo === 'pet')) juntar('conserto', 'O site não fala de valor', 'Sem faixa de preço, o contato vira pergunta de preço e a agenda não anda.');
    if (!r.formulario && !r.whatsapp) juntar('conserto', 'O site não tem por onde chamar', 'Nem formulário nem WhatsApp: o visitante precisa copiar um telefone na mão.');
    if (!r.mapa && n.end) juntar('conserto', 'O site não mostra onde fica', 'Endereço e mapa faltando numa operação que atende presencial.');
  }

  /* 6. o perfil do Google, que é de graça e está capenga */
  if (perfil?.itens?.length) {
    const faltas = perfil.itens.filter((i) => i.estado === 'falta' || i.estado === 'ruim');
    if (faltas.length) {
      juntar('google', 'Arrumar o perfil do Google junto',
        faltas.slice(0, 4).map((f) => f.item.toLowerCase()).join(', ') + '. É de graça, entra como brinde da proposta e já rende movimento antes da página ir ao ar.');
    }
  }

  /* 7. contato: o que existe hoje pra chamar essa pessoa */
  const canais = [];
  if (n.whatsapp) canais.push('WhatsApp');
  else if (n.fone) canais.push('telefone');
  if (n.email) canais.push('e-mail');
  if (n.redes && Object.keys(n.redes).length) canais.push('rede social');
  if (!canais.length) {
    juntar('busca', 'Achar um contato antes de abordar',
      'Não veio telefone nem e-mail. Antes de escrever, procure o negócio no Google pelo nome e confira a ficha, senão a mensagem não tem pra onde ir.');
  }

  const titulo = n.semNada ? 'Criar do zero' : n.diretorio ? 'Sair do diretório' : n.soRede ? 'Tirar da rede social' : (d && d.nota != null && d.nota < 50) ? 'Refazer o site' : 'Refazer a primeira tela';
  const resumo = n.semNada
    ? `${nomeCurto(n)} não tem onde cair quando alguém procura. A entrega é uma página de uma dobra que vira o destino do Maps e da indicação.`
    : n.diretorio
      ? `O endereço que ${nomeCurto(n)} usa como site é uma ficha de diretório, onde o concorrente aparece do lado. A entrega é a página própria que tira vocês de lá.`
      : n.soRede
        ? `${nomeCurto(n)} vive de rede social. A entrega é a página que responde o que o perfil não responde e libera o direct.`
          : d && d.nota != null
            ? `O site de ${nomeCurto(n)} está em ${d.nota} de 100 no primeiro olhar. A entrega é a primeira tela refeita, com o que trava a conversão resolvido.`
            : `A entrega é a primeira tela de ${nomeCurto(n)} refeita, com prova e contato no lugar certo.`;

  const grandes = itens.length;
  const prazo = grandes >= 12 ? 'de 7 a 10 dias' : grandes >= 8 ? 'de 5 a 7 dias' : 'de 3 a 5 dias';

  return { titulo, resumo, prazo, itens, destaques: dest };
}
