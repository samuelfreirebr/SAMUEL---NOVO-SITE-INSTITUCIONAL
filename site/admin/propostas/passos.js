/* ============================================================
   As etapas do editor, na ordem em que aparecem na página.

   Cada etapa diz:
     titulo, resumo   o que o cliente vê nessa parte
     alvo             onde a prévia rola quando a etapa abre
     chaves           o que "Restaurar texto padrão" copia do modelo
     parte            a chave de ligar e desligar da seção inteira
     falta(p)         o que ainda precisa ser preenchido (ou nada)
     montar(p)        os blocos do formulário
   ============================================================ */

import {
  h, texto, linhas, linha, chave, chaveParte, bloco, blocoParte, repetidor,
  seletorIcone, iconeEscolhido, campoImagem, opcoes, paraLinhas,
} from './ui.js';

const apelidar = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const PARCELAS = [1, 2, 3, 4, 5, 6, 10, 12];
const MOEDAS = ['R$', '$', '€'];

function dinheiro(inv) {
  const n = Math.max(1, Number(inv.parcelas) || 1);
  const v = Number(inv.valorParcela) || 0;
  const moeda = inv.moeda || 'R$';
  const fmt = new Intl.NumberFormat(moeda === 'R$' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 2 });
  const d = (x) => moeda + (moeda.length > 1 ? ' ' : '') + fmt.format(x);
  if (!v) return { grande: 'Sem valor', apoio: 'Preencha o valor da parcela.' };
  return n === 1 ? { grande: d(v), apoio: 'à vista' } : { grande: n + 'x ' + d(v), apoio: 'total ' + d(n * v) };
}

export const PASSOS = [
  /* ---------- 1. cliente ---------- */
  {
    id: 'cliente', titulo: 'Cliente', resumo: 'Para quem é, o endereço e a validade.',
    alvo: '.prop-capa', soProposta: true,
    falta: (p) => (!p.cliente ? 'Falta o nome do cliente.' : !p.id ? 'Falta o endereço.' : ''),
    montar(p, { novo }) {
      const endereco = texto(p, 'id', 'Endereço da página', { dica: 'Vira /propostas/endereco. Só minúsculas, números e hífen.', placeholder: 'hunter-interior-design' });
      const inputEnd = endereco.querySelector('input');
      const prefixo = h('span', { class: 'ed-prefixo' }, '/propostas/');
      inputEnd.before(prefixo);
      inputEnd.parentElement.classList.add('ed-campo--prefixo');
      let endManual = Boolean(p.id);
      inputEnd.addEventListener('input', () => { endManual = true; });

      const nome = texto(p, 'cliente', 'Nome do cliente', {
        dica: 'Aparece na capa, no rodapé e na mensagem do WhatsApp.',
        placeholder: 'Hunter Interior Design',
        aoMudar: (v) => {
          // O endereço acompanha o nome até ser mexido à mão.
          if (novo && !endManual) { p.id = apelidar(v); inputEnd.value = p.id; }
        },
      });

      return [
        bloco('Quem recebe', { filhos: [
          nome,
          endereco,
          texto(p, 'preparadaPara', 'Preparada para', { dica: 'Opcional. Nome da pessoa ou da empresa completa. Vazio, usa o nome do cliente.' }),
        ] }),
        bloco('Datas', { filhos: [
          linha(
            texto(p, 'data', 'Data', { dica: 'Vazio, usa a data em que foi criada.', placeholder: '12 de setembro de 2026' }),
            texto(p, 'validade', 'Validade', { placeholder: '15 dias' })),
        ] }),
        bloco('Na capa', { filhos: [
          chaveParte(p, 'ficha', 'Mostrar a ficha ao lado do título', 'O cartão com as iniciais do cliente, quem faz, data e validade.'),
        ] }),
        bloco('Publicação', { filhos: [
          chave({
            rotulo: 'No ar', dica: 'Ligado, quem tem o link abre. Desligado, é rascunho: só você, logado, vê.',
            ler: () => p.publicada !== false, escrever: (v) => { p.publicada = v; },
          }),
        ] }),
      ];
    },
  },

  /* ---------- 2. capa ---------- */
  {
    id: 'capa', titulo: 'Capa', resumo: 'A frase grande e a linha de apoio.',
    alvo: '.prop-capa', chaves: ['titulo', 'subtitulo'],
    falta: (p) => (!p.titulo ? 'Falta o título da capa.' : ''),
    montar: (p) => [
      bloco('Textos', { filhos: [
        texto(p, 'titulo', 'Título', { area: true, linhas: 2, dica: 'A frase grande da abertura. Curta: cabe em duas ou três linhas.' }),
        texto(p, 'subtitulo', 'Subtítulo', { area: true, linhas: 2, dica: 'Uma linha dizendo o que a proposta cobre.' }),
      ] }),
    ],
  },

  /* ---------- 3. escopo ---------- */
  {
    id: 'escopo', titulo: 'Escopo', resumo: 'O que será entregue, item por item.',
    alvo: '#escopo', chaves: ['escopo'], parte: 'escopo',
    montar: (p) => [
      bloco('Entregáveis', { dica: 'Cada um vira uma linha numerada, com ícone, descrição e etiqueta.', filhos: [
        repetidor({
          lista: (p.escopo ||= []), nome: 'Entregável',
          novo: () => ({ titulo: '', descricao: '', marca: '' }),
          resumo: (it) => it.titulo,
          icone: { padrao: () => 'camadas', escolhido: (it) => iconeEscolhido(it, 'camadas') },
          montar: (it, i, resumir) => [
            texto(it, 'titulo', 'Título', { aoMudar: resumir }),
            texto(it, 'descricao', 'Descrição', { area: true, linhas: 2 }),
            texto(it, 'marca', 'Etiqueta', { dica: 'Palavra curta à direita. Ex.: Identidade, Web, Impresso.' }),
          ],
        }),
      ] }),
    ],
  },

  /* ---------- 4. o que inclui ---------- */
  {
    id: 'inclui', titulo: 'O que inclui', resumo: 'A lista do que vem em cada entrega.',
    alvo: '.prop-inclui', chaves: ['inclui'], parte: 'inclui',
    montar: (p) => {
      const inc = p.inclui ||= { itens: [], grupos: [] };
      const grupos = h('div', {}, repetidor({
        lista: (inc.grupos ||= []), nome: 'Subgrupo',
        novo: () => ({ titulo: '', itens: [] }),
        resumo: (g) => g.titulo,
        montar: (g, i, resumir) => [
          texto(g, 'titulo', 'Título do subgrupo', { aoMudar: resumir }),
          linhas(g, 'itens', 'Itens', { linhas: 4 }),
        ],
      }));
      return [
        bloco('Cabeçalho', { filhos: [
          linha(texto(inc, 'rotulo', 'Rótulo pequeno', { placeholder: 'O que inclui' }), texto(inc, 'titulo', 'Título', { placeholder: 'Cada entregável inclui' })),
          texto(inc, 'texto', 'Texto de apoio', { area: true, linhas: 2 }),
        ] }),
        bloco('Itens', { dica: 'Com 8 ou mais, a lista vira duas colunas.', filhos: [linhas(inc, 'itens', 'Um item por linha', { dica: '', linhas: 10 })] }),
        blocoParte(p, 'incluiGrupos', 'Subgrupos', 'Listas com título próprio abaixo dos itens.', [grupos]),
      ];
    },
  },

  /* ---------- 5. processo ---------- */
  {
    id: 'processo', titulo: 'Processo', resumo: 'As etapas de trabalho, da descoberta à entrega.',
    alvo: '#processo', chaves: ['processo'], parte: 'processo',
    montar: (p) => {
      const proc = p.processo ||= { etapas: [] };
      const padrao = (i) => ['lupa', 'alvo', 'roteiro', 'codigo', 'check', 'caixa'][i] || 'check';
      return [
        bloco('Cabeçalho', { filhos: [
          linha(texto(proc, 'rotulo', 'Rótulo pequeno', { placeholder: 'Como trabalhamos' }), texto(proc, 'titulo', 'Título', { placeholder: 'Nosso processo' })),
        ] }),
        bloco('Etapas', { dica: 'Na página, a seção fica presa na tela e as etapas acendem uma a uma.', filhos: [
          repetidor({
            lista: (proc.etapas ||= []), nome: 'Etapa',
            novo: () => ({ titulo: '', texto: '' }),
            resumo: (e) => e.titulo,
            icone: { padrao, escolhido: (e, i) => iconeEscolhido(e, padrao(i)) },
            montar: (e, i, resumir) => [
              texto(e, 'titulo', 'Nome', { placeholder: 'Descoberta', aoMudar: resumir }),
              texto(e, 'texto', 'Texto', { area: true, linhas: 2 }),
              texto(e, 'nota', 'Nota', { dica: 'Opcional. Linha menor abaixo do texto.' }),
            ],
          }),
        ] }),
        bloco('Rodapé', { filhos: [texto(proc, 'rodape', 'Frase abaixo das etapas', { dica: 'Opcional.' })] }),
      ];
    },
  },

  /* ---------- 6. investimento ---------- */
  {
    id: 'investimento', titulo: 'Investimento', resumo: 'Valor, parcelas e como pagar.',
    alvo: '#investimento', chaves: ['investimento', 'pagamento'],
    falta: (p) => (p.visivel?.investimento !== false && !(Number(p.investimento?.valorParcela) > 0) && !p.investimento?.valor ? 'Falta o valor.' : ''),
    montar: (p) => {
      const inv = p.investimento ||= { moeda: 'R$', parcelas: 1, valorParcela: 0 };
      const pag = p.pagamento ||= {};
      const conta = pag.conta ||= [];

      const previa = h('div', { class: 'ed-valor' });
      const pintarValor = () => { const d = dinheiro(inv); previa.innerHTML = ''; previa.append(h('b', {}, d.grande), h('small', {}, d.apoio)); };
      pintarValor();

      const forma = texto(pag, 'forma', 'Forma', { placeholder: '2 parcelas (50% / 50%)' });
      const trocarParcelas = (n) => {
        inv.parcelas = n;
        // a forma acompanha as parcelas enquanto estiver no texto padrão
        if (!pag.forma || /parcela|vista/i.test(pag.forma)) {
          pag.forma = n === 1 ? 'À vista' : n + ' parcelas' + (n === 2 ? ' (50% / 50%)' : '');
          forma.querySelector('input').value = pag.forma;
        }
        pintarValor();
      };

      const linhasConta = h('div', { class: 'ed-pares' });
      const pintarConta = () => {
        linhasConta.innerHTML = '';
        conta.forEach((par, i) => {
          const r = h('input', { type: 'text', placeholder: 'Banco' }); r.value = par[0] || '';
          const v = h('input', { type: 'text', placeholder: 'Wise' }); v.value = par[1] || '';
          r.addEventListener('input', () => { par[0] = r.value; ctxMudou(); });
          v.addEventListener('input', () => { par[1] = v.value; ctxMudou(); });
          linhasConta.append(h('div', { class: 'ed-par' }, r, v,
            h('button', { type: 'button', class: 'ed-icobtn ed-icobtn--perigo', title: 'Remover', html: '&times;', onclick: () => { conta.splice(i, 1); ctxMudou(); pintarConta(); } })));
        });
        linhasConta.append(h('button', { type: 'button', class: 'ed-adicionar', onclick: () => { conta.push(['', '']); ctxMudou(); pintarConta(); } }, '+ Adicionar dado'));
      };
      pintarConta();

      const corpoPag = h('div', {},
        texto(pag, 'chamada', 'Frase de abertura', { placeholder: 'Confiança constrói grandes negócios.' }),
        linha(forma, texto(pag, 'etapas', 'Quando paga', { placeholder: 'Início do projeto + finalização' })));

      return [
        blocoParte(p, 'investimento', 'Valor', 'O número grande, com parcelas e total.', [
          linha(
            opcoes('Moeda', MOEDAS, () => inv.moeda || 'R$', (m) => { inv.moeda = m; pintarValor(); }),
            opcoes('Parcelas', PARCELAS, () => Number(inv.parcelas || 1), trocarParcelas, (n) => (n === 1 ? 'À vista' : n + 'x'))),
          linha(
            texto(inv, 'valorParcela', 'Valor de cada parcela', { tipo: 'number', dica: 'Só o número. Ex.: 750', aoMudar: pintarValor }),
            texto(inv, 'rotulo', 'Rótulo', { placeholder: 'Investimento' })),
          previa,
          texto(inv, 'nota', 'Observação', { area: true, linhas: 3, dica: 'Suporte, o que está incluso etc.' }),
        ]),
        blocoParte(p, 'pagamento', 'Pagamento', 'Frase, forma e quando paga.', [corpoPag]),
        blocoParte(p, 'conta', 'Dados para pagamento', 'Cada dado ganha um botão de copiar na página.', [linhasConta]),
      ];
    },
  },

  /* ---------- 7. condições ---------- */
  {
    id: 'condicoes', titulo: 'Condições', resumo: 'Garantia, prazo, ferramentas, contrato.',
    alvo: '.prop-condicoes', chaves: ['condicoes'], parte: 'condicoes',
    montar: (p) => {
      const padrao = (i) => ['escudo', 'relogio', 'check', 'documento'][i] || 'check';
      return [
        bloco('Cartões', { dica: 'Quatro ficam numa fileira no computador.', filhos: [
          repetidor({
            lista: (p.condicoes ||= []), nome: 'Condição',
            novo: () => ({ titulo: '', texto: '' }),
            resumo: (c) => c.titulo,
            icone: { padrao, escolhido: (c, i) => iconeEscolhido(c, padrao(i)) },
            montar: (c, i, resumir) => [
              texto(c, 'titulo', 'Título', { aoMudar: resumir }),
              texto(c, 'texto', 'Texto', { area: true, linhas: 4, dica: 'Enter separa parágrafos.' }),
            ],
          }),
        ] }),
      ];
    },
  },

  /* ---------- 8. sobre mim ---------- */
  {
    id: 'sobre', titulo: 'Sobre mim', resumo: 'Retrato, texto, números e fotos.',
    alvo: '#sobre', chaves: ['sobre', 'assinatura'], parte: 'sobre',
    montar: (p) => {
      const sob = p.sobre ||= {};
      const ass = p.assinatura ||= {};
      const galeria = h('div', { class: 'ed-galeria' });
      const fotos = (sob.galeria ||= []);
      const pintarGaleria = () => {
        galeria.innerHTML = '';
        fotos.forEach((src, i) => {
          galeria.append(h('figure', { class: 'ed-foto' },
            h('img', { src, alt: '' }),
            h('figcaption', {},
              h('button', { type: 'button', class: 'ed-icobtn', title: 'Para trás', html: '&larr;', disabled: i === 0, onclick: () => { [fotos[i - 1], fotos[i]] = [fotos[i], fotos[i - 1]]; ctxMudou(); pintarGaleria(); } }),
              h('button', { type: 'button', class: 'ed-icobtn', title: 'Para frente', html: '&rarr;', disabled: i === fotos.length - 1, onclick: () => { [fotos[i + 1], fotos[i]] = [fotos[i], fotos[i + 1]]; ctxMudou(); pintarGaleria(); } }),
              h('button', { type: 'button', class: 'ed-icobtn ed-icobtn--perigo', title: 'Tirar', html: '&times;', onclick: () => { fotos.splice(i, 1); ctxMudou(); pintarGaleria(); } }))));
        });
        galeria.append(h('button', { type: 'button', class: 'ed-foto ed-foto--nova', onclick: async () => { const url = await escolherImagemCtx(); if (url) { fotos.push(url); ctxMudou(); pintarGaleria(); } } }, '+ Foto'));
      };
      pintarGaleria();

      return [
        bloco('Apresentação', { filhos: [
          campoImagem(sob, 'foto', 'Retrato', 'Vertical. Fica à esquerda do texto.'),
          linha(texto(sob, 'rotulo', 'Rótulo pequeno', { placeholder: 'Sobre mim' }), texto(sob, 'nome', 'Nome', { placeholder: 'Samuel Freire' })),
          texto(sob, 'cargo', 'Cargo', { placeholder: 'Designer digital & estrategista' }),
          texto(sob, 'texto', 'Texto', { area: true, linhas: 7, dica: 'Enter separa parágrafos.' }),
        ] }),
        blocoParte(p, 'metricas', 'Números', 'Número grande com uma frase ao lado.', [
          repetidor({
            lista: (sob.metricas ||= []), nome: 'Número',
            novo: () => ({ n: '', rotulo: '' }),
            resumo: (m) => [m.n, paraLinhas(m.rotulo).join(' ')].filter(Boolean).join('  '),
            montar: (m, i, resumir) => [
              linha(
                texto(m, 'n', 'Número', { placeholder: '6+', dica: 'Pode ser emoji, como bandeiras.', aoMudar: resumir }),
                texto(m, 'rotulo', 'Frase', { area: true, linhas: 2, aoMudar: resumir })),
              chave({ rotulo: 'Régua laranja', dica: 'Destaca este número.', ler: () => Boolean(m.destaque), escrever: (v) => { m.destaque = v; } }),
            ],
          }),
        ]),
        blocoParte(p, 'galeria', 'Galeria de fotos', 'Seis fotos formam o arranjo do PDF; outra quantidade vira fileira.', [galeria]),
        blocoParte(p, 'assinatura', 'Assinatura', 'A linha com seu nome abaixo do texto.', [
          texto(ass, 'papel', 'Papel', { placeholder: 'Responsável pelo projeto' }),
          linha(texto(ass, 'nome', 'Nome', { placeholder: 'Samuel' }), texto(ass, 'sobrenome', 'Sobrenome', { placeholder: 'Freire', dica: 'Sai em laranja.' })),
        ]),
      ];
    },
  },

  /* ---------- 9. ecossistema ---------- */
  {
    id: 'ecossistema', titulo: 'Ecossistema', resumo: 'As frentes em volta do círculo laranja.',
    alvo: '#ecossistema', chaves: ['ecossistema'], parte: 'ecossistema',
    montar: (p) => {
      const eco = p.ecossistema ||= { frentes: [] };
      eco.centro ||= {};
      const padrao = (i) => ['pena', 'globo', 'megafone', 'cpu'][i] || 'camadas';
      return [
        bloco('Cabeçalho', { filhos: [
          texto(eco, 'rotulo', 'Rótulo pequeno', { placeholder: 'Nosso ecossistema' }),
          texto(eco, 'texto', 'Texto de apoio', { area: true, linhas: 2 }),
        ] }),
        bloco('Círculo do meio', { filhos: [
          linha(texto(eco.centro, 'sup', 'Linha de cima', { placeholder: '04 frentes' }), texto(eco.centro, 'titulo', 'Título', { placeholder: 'Nosso ecossistema' })),
        ] }),
        bloco('Frentes', { dica: 'Quatro ficam duas de cada lado do círculo.', filhos: [
          repetidor({
            lista: (eco.frentes ||= []), nome: 'Frente', max: 4,
            novo: () => ({ titulo: '', itens: [] }),
            resumo: (f) => f.titulo,
            icone: { padrao, escolhido: (f, i) => iconeEscolhido(f, padrao(i)) },
            montar: (f, i, resumir) => [
              texto(f, 'titulo', 'Título', { placeholder: 'Digital', aoMudar: resumir }),
              linhas(f, 'itens', 'Itens', { linhas: 5 }),
              chave({ rotulo: 'Bloco escuro', ler: () => Boolean(f.escuro), escrever: (v) => { f.escuro = v; } }),
            ],
          }),
        ] }),
      ];
    },
  },

  /* ---------- 10. encerramento ---------- */
  {
    id: 'encerramento', titulo: 'Encerramento', resumo: 'O próximo passo, os botões e os contatos.',
    alvo: '.prop-fim', chaves: ['encerramento', 'contato'], parte: 'encerramento',
    montar: (p) => {
      const con = p.contato ||= {};
      return [
        bloco('Chamada', { filhos: [
          linha(texto(con, 'rotuloSecao', 'Rótulo pequeno', { placeholder: 'Próximo passo' }), texto(p, 'encerramento', 'Frase final', { placeholder: 'Vamos construir isso juntos?' })),
          texto(con, 'texto', 'Texto de apoio', { area: true, linhas: 2 }),
        ] }),
        bloco('Botão principal', { filhos: [
          linha(texto(con, 'rotulo', 'Texto do botão', { placeholder: 'Confirmar orçamento' }), texto(con, 'link', 'Link', { placeholder: 'https://wa.me/55...' })),
          texto(con, 'mensagem', 'Mensagem que chega no WhatsApp', { dica: 'O nome do cliente entra no fim da frase.' }),
        ] }),
        blocoParte(p, 'botaoDuvidas', 'Botão "Tenho dúvidas"', 'Abre as perguntas frequentes. Desligado, as perguntas ficam abertas direto na página.', [
          texto(con, 'rotuloDuvidas', 'Texto do botão', { placeholder: 'Tenho dúvidas' }),
        ]),
        blocoParte(p, 'contatos', 'Contatos ao lado', 'WhatsApp, e-mail e portfólio em linhas.', [
          linha(texto(con, 'whatsapp', 'WhatsApp', { placeholder: '+55 83 98207-8301' }), texto(con, 'email', 'E-mail')),
          texto(con, 'portfolio', 'Portfólio', { placeholder: 'behance.net/samuelfreirebr' }),
        ]),
      ];
    },
  },

  /* ---------- 11. perguntas ---------- */
  {
    id: 'faq', titulo: 'Perguntas frequentes', resumo: 'As dúvidas de sempre, respondidas.',
    alvo: '#duvidas', chaves: ['faq'], parte: 'faq',
    montar: (p) => {
      const faq = p.faq ||= { itens: [] };
      return [
        bloco('Cabeçalho', { filhos: [
          linha(texto(faq, 'rotulo', 'Rótulo pequeno', { placeholder: 'Perguntas frequentes' }), texto(faq, 'titulo', 'Título')),
          texto(faq, 'texto', 'Texto de apoio', { area: true, linhas: 2 }),
        ] }),
        bloco('Perguntas', { filhos: [
          repetidor({
            lista: (faq.itens ||= []), nome: 'Pergunta',
            novo: () => ({ pergunta: '', resposta: '' }),
            resumo: (f) => f.pergunta,
            montar: (f, i, resumir) => [
              texto(f, 'pergunta', 'Pergunta', { aoMudar: resumir }),
              texto(f, 'resposta', 'Resposta', { area: true, linhas: 4, dica: 'Enter separa parágrafos.' }),
            ],
          }),
        ] }),
        bloco('Rodapé', { filhos: [
          linha(texto(faq, 'rodape', 'Frase', { placeholder: 'Ficou alguma dúvida que não está aqui?' }), texto(faq, 'rodapeLink', 'Texto do link', { placeholder: 'Me chama no WhatsApp' })),
        ] }),
      ];
    },
  },
];

/* Ligações que as etapas pedem ao editor (preenchidas por ele). */
let ctxMudou = () => {};
let escolherImagemCtx = async () => null;
export function ligarPassos({ mudou, escolherImagem }) { ctxMudou = mudou; escolherImagemCtx = escolherImagem; }
