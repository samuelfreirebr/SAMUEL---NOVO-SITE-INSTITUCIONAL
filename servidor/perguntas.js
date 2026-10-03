/* ============================================================
   Briefing: as perguntas que o cliente responde depois de aceitar.

   Três origens de pergunta convivem no mesmo formulário:

   1. Blocos prontos (contrato, materiais, hospedagem, Google).
      Texto fixo, escrito uma vez. Cada um liga e desliga no painel,
      e a IA já marca os que fazem sentido pelo que foi contratado.
   2. Blocos da IA, escritos a partir da proposta e da transcrição,
      porque mudam de cliente para cliente.
   3. O que o Samuel escrever à mão na tela do briefing.

   Depois de gerado, tudo é editável: o que a IA escreveu vira só um
   ponto de partida. O que manda é o que está salvo.

   O link é sorteado, como o da fatura: a página é aberta (o cliente
   não tem login) e o endereço é a credencial.
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pedirJsonIa, temChaveIa, semTravessao } from './proposta-ia.js';
import { metaCompartilhar } from './compartilhar.js';

const limpo = (t) => semTravessao(t).trim();

/* ---------- interrogação ----------
   Pergunta escrita como "Qual é o tamanho do time" sai com "?" no fim.
   Frase de comando ("Envie as fotos", "Conte a história") fica como está. */
const ABRE_PERGUNTA = /^(qual|quais|quem|como|onde|quando|quanto|quantos|quantas|por que|o que|com qual|em qual|de qual|para que|você|já|usa|tem|existe|falta|há|a empresa|a marca|o site|o domínio|o endereço)(?=\s|$)/i;   // \b não enxerga letra acentuada ("você", "já")
export function comInterrogacao(t) {
  const x = String(t || '').trim();
  return x && !/[?.:!]$/.test(x) && ABRE_PERGUNTA.test(x) ? x + '?' : x;
}


export const TIPOS = ['texto', 'longo', 'escolha', 'varias', 'email', 'link', 'telefone', 'arquivo'];

/* ---------- blocos prontos ----------
   O do contrato é o único que nasce ligado: sem ele o contrato sai
   com [PREENCHER]. Os outros o painel liga conforme o projeto. */

export const BLOCOS_PRONTOS = [
  {
    id: 'contrato',
    pronto: 'contrato',
    ligado: true,
    titulo: 'Dados para o contrato',
    texto: 'São os dados que entram no contrato. Se você é pessoa física, use CPF e o nome completo.',
    perguntas: [
      { id: 'razaoSocial', pergunta: 'Razão social ou nome completo', ajuda: '', tipo: 'texto', opcoes: [], obrigatoria: true },
      { id: 'documento', pergunta: 'CNPJ ou CPF', ajuda: '', tipo: 'texto', opcoes: [], obrigatoria: true },
      { id: 'endereco', pergunta: 'Endereço completo', ajuda: 'Rua, número, bairro, cidade, estado e CEP.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'email', pergunta: 'E-mail para o contrato', ajuda: '', tipo: 'email', opcoes: [], obrigatoria: true },
      { id: 'responsavel', pergunta: 'Quem assina pela empresa', ajuda: 'Nome de quem vai assinar, se for diferente do nome acima.', tipo: 'texto', opcoes: [], obrigatoria: false },
      { id: 'telefone', pergunta: 'Telefone ou WhatsApp', ajuda: '', tipo: 'telefone', opcoes: [], obrigatoria: false },
    ],
  },
  {
    id: 'empresa',
    pronto: 'empresa',
    ligado: true,
    titulo: 'Sobre a empresa',
    texto: 'O básico do seu negócio, para eu escrever certo desde o começo.',
    perguntas: [
      { id: 'emp-servicos', pergunta: 'Quais serviços ou produtos a sua empresa oferece', ajuda: 'Liste todos, um por linha.', tipo: 'longo', opcoes: [], obrigatoria: true },
    ],
  },
  {
    id: 'identidade',
    pronto: 'identidade',
    ligado: false,
    titulo: 'Marca e identidade visual',
    texto: 'Com isso eu entendo quem é a marca e como ela precisa parecer.',
    perguntas: [
      { id: 'ide-nome', pergunta: 'Qual é o nome da marca exatamente como deve aparecer', ajuda: 'Do jeito que deve ser escrito, com maiúsculas e acentos.', tipo: 'texto', opcoes: [], obrigatoria: true },
      { id: 'ide-slogan', pergunta: 'A marca tem slogan ou uma frase que a resume', ajuda: 'Se não tiver, escreva Não.', tipo: 'texto', opcoes: [], obrigatoria: false },
      { id: 'ide-publico', pergunta: 'Quem é o seu público', ajuda: 'Idade, perfil, o que essas pessoas procuram em você.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'ide-sensacao', pergunta: 'Que sensação a marca precisa passar', ajuda: 'Marque até três.', tipo: 'varias', opcoes: ['Confiança', 'Sofisticação', 'Modernidade', 'Proximidade', 'Energia', 'Tradição', 'Simplicidade', 'Ousadia'], obrigatoria: true },
      { id: 'ide-estilo', pergunta: 'Qual estilo visual combina mais com a marca', ajuda: '', tipo: 'escolha', opcoes: ['Minimalista e limpo', 'Clássico e elegante', 'Moderno e tecnológico', 'Artesanal e acolhedor', 'Ousado e colorido'], obrigatoria: true },
      { id: 'ide-cores', pergunta: 'Tem cores que você quer ou que não quer de jeito nenhum', ajuda: 'Se não tiver preferência, escreva Não.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'ide-referencias', pergunta: 'Marcas ou perfis que você admira', ajuda: 'Um por linha, de qualquer área. Se não tiver, escreva Não.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'ide-aplicacoes', pergunta: 'Onde a marca vai ser aplicada', ajuda: 'Marque tudo o que se aplica.', tipo: 'varias', opcoes: ['Site', 'Redes sociais', 'Cartão e papelaria', 'Embalagem', 'Fachada ou placa', 'Uniforme', 'Folder ou catálogo'], obrigatoria: true },
    ],
  },
  {
    id: 'materiais',
    pronto: 'materiais',
    ligado: false,
    titulo: 'Materiais da marca',
    texto: 'Mande aqui o que você já tem. Pode subir os arquivos direto nesta página.',
    perguntas: [
      { id: 'mat-identidade', pergunta: 'A marca já tem identidade visual', ajuda: 'Logo, cores e fontes definidos.', tipo: 'escolha', opcoes: ['Sim, já tenho', 'Tenho só o logo', 'Não tenho'], obrigatoria: true },
      { id: 'mat-logo', pergunta: 'Logo em alta qualidade', ajuda: 'De preferência em PNG com fundo transparente, PDF, SVG ou AI. Se não tiver, escreva Não no campo de observações.', tipo: 'arquivo', opcoes: [], obrigatoria: false, se: { id: 'mat-identidade', valor: ['Sim, já tenho', 'Tenho só o logo'] } },
      { id: 'mat-manual', pergunta: 'Manual da marca, se existir', ajuda: 'O arquivo com as cores, as fontes e as regras de uso do logo.', tipo: 'arquivo', opcoes: [], obrigatoria: false, se: { id: 'mat-identidade', valor: 'Sim, já tenho' } },
      { id: 'mat-pasta', pergunta: 'Link de uma pasta com o resto do material', ajuda: 'Cole o link da pasta no Drive, no Dropbox ou no WeTransfer. Se não tiver, escreva Não.', tipo: 'link', opcoes: [], obrigatoria: false },
      { id: 'mat-obs', pergunta: 'Alguma observação sobre esses materiais', ajuda: 'O que pode ser usado, o que não pode, o que está desatualizado.', tipo: 'longo', opcoes: [], obrigatoria: false },
    ],
  },
  {
    id: 'estrutura',
    pronto: 'estrutura',
    ligado: false,
    titulo: 'Estrutura do site',
    texto: 'Marque o que o seu site precisa ter. É só clicar, não precisa escrever.',
    perguntas: [
      { id: 'est-secoes', pergunta: 'Quais seções o site deve ter', ajuda: 'Marque todas que fazem sentido para o seu negócio.', tipo: 'varias', opcoes: ['Início com apresentação', 'Sobre a empresa', 'Serviços', 'Produtos', 'Portfólio ou projetos', 'Depoimentos de clientes', 'Perguntas frequentes', 'Equipe', 'Localização e mapa', 'Formulário de contato'], obrigatoria: true },
      { id: 'est-acao', pergunta: 'Qual é a principal ação que o visitante deve fazer', ajuda: 'O site inteiro vai levar a pessoa até isso.', tipo: 'escolha', opcoes: ['Chamar no WhatsApp', 'Pedir um orçamento', 'Comprar online', 'Agendar um horário', 'Ligar', 'Preencher um formulário'], obrigatoria: true },
      { id: 'est-extra', pergunta: 'Falta alguma seção que não está na lista', ajuda: 'Se não faltar, escreva Não.', tipo: 'texto', opcoes: [], obrigatoria: false },
      { id: 'est-tema', pergunta: 'O site deve ser claro ou escuro', ajuda: '', tipo: 'escolha', opcoes: ['Claro', 'Escuro', 'Deixo com você'], obrigatoria: false },
    ],
  },
  {
    id: 'copy',
    pronto: 'copy',
    ligado: false,
    titulo: 'Promessas e diferenciais',
    texto: 'É com isso que eu escrevo o texto do seu site. Quanto mais específico, melhor o resultado.',
    perguntas: [
      { id: 'cop-formulario', pergunta: 'O site vai ter formulário', ajuda: 'Para a pessoa deixar nome e contato.', tipo: 'escolha', opcoes: ['Sim', 'Não'], obrigatoria: true },
      { id: 'cop-form-campos', pergunta: 'Quais informações o formulário precisa pedir', ajuda: 'Marque o que você precisa receber de cada pessoa que preencher.', tipo: 'varias', opcoes: ['Nome', 'E-mail', 'Telefone ou WhatsApp', 'Empresa', 'Cidade', 'Serviço de interesse', 'Mensagem', 'Orçamento estimado'], obrigatoria: true, se: { id: 'cop-formulario', valor: 'Sim' } },
      { id: 'cop-promessas', pergunta: 'Quais são as promessas que fazem a pessoa comprar de você', ajuda: 'Liste no mínimo 3. Se já tiver um texto pronto, cole aqui.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'cop-fortes', pergunta: 'Quais são os 4 pontos fortes do seu negócio', ajuda: 'Um por linha.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'cop-numeros', pergunta: 'Quais números de autoridade você pode mostrar', ajuda: 'No mínimo 3, no máximo 5. Se não tiver, escreva Não.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'cop-referencias', pergunta: 'Sites que você admira ou concorrentes', ajuda: 'Um endereço por linha. Se não tiver, escreva Não.', tipo: 'longo', opcoes: [], obrigatoria: false },
    ],
  },
  {
    id: 'folder',
    pronto: 'folder',
    ligado: false,
    titulo: 'Folder comercial',
    texto: 'É com estas respostas que eu escrevo o texto do seu folder. Pode responder do seu jeito, que eu organizo.',
    perguntas: [
      { id: 'fol-cidade', pergunta: 'Cidade ou região onde você atende', ajuda: '', tipo: 'texto', opcoes: [], obrigatoria: true },
      { id: 'fol-historia', pergunta: 'Conte a história da empresa', ajuda: 'Quando e como começou, o que significa o nome, como chegou até aqui.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'fol-time', pergunta: 'Qual é o tamanho do time', ajuda: 'Contando equipe própria e parceiros.', tipo: 'escolha', opcoes: ['Só eu', 'De 2 a 5 pessoas', 'De 6 a 10 pessoas', 'Mais de 10 pessoas'], obrigatoria: false },
      { id: 'fol-funciona', pergunta: 'Como funciona o serviço, do primeiro contato até a entrega', ajuda: 'Passo a passo, do orçamento ao pagamento final.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'fol-prazo', pergunta: 'Prazo para enviar o orçamento e valor do sinal', ajuda: 'Exemplo: orçamento em 2 a 3 dias úteis, sinal de 30% a 50%.', tipo: 'texto', opcoes: [], obrigatoria: false },
      { id: 'fol-diferenciais', pergunta: 'Quais são os seus diferenciais', ajuda: 'Um por linha.', tipo: 'longo', opcoes: [], obrigatoria: true },
      { id: 'fol-garantia', pergunta: 'Como funciona a garantia', ajuda: 'Se não tiver, escreva Não.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'fol-avaliacoes', pergunta: 'Onde estão as suas avaliações', ajuda: '', tipo: 'varias', opcoes: ['Google', 'Facebook', 'Instagram', 'Site próprio', 'Ainda não tenho'], obrigatoria: false },
      { id: 'fol-nota', pergunta: 'Quantidade e nota das avaliações', ajuda: 'Exemplo: 48 avaliações, nota 4,9. Se não tiver, escreva Não.', tipo: 'texto', opcoes: [], obrigatoria: false, se: { id: 'fol-avaliacoes', valor: ['Google', 'Facebook', 'Instagram', 'Site próprio'] } },
      { id: 'fol-produtos', pergunta: 'Produtos, marcas ou materiais que você recomenda', ajuda: 'E para qual situação cada um serve.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'fol-cuidados', pergunta: 'Cuidados e manutenção depois da entrega', ajuda: 'O que o cliente precisa saber para o resultado durar.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'fol-duvidas', pergunta: 'Quais perguntas os clientes mais fazem', ajuda: 'Com a resposta que você costuma dar. Se não souber, escreva Não sei.', tipo: 'longo', opcoes: [], obrigatoria: false },
    ],
  },
  {
    id: 'fotos',
    pronto: 'fotos',
    ligado: false,
    titulo: 'Fotos do site',
    texto: 'Primeiro as fotos. Os textos vêm na próxima etapa.',
    perguntas: [
      { id: 'fot-envio', pergunta: 'Envie as fotos que devem ir para o site', ajuda: 'Equipe, espaço, produtos, trabalhos feitos. Pode selecionar várias de uma vez.', tipo: 'arquivo', opcoes: [], obrigatoria: false },
      { id: 'fot-faltam', pergunta: 'Você acha que tem fotos boas o suficiente', ajuda: '', tipo: 'escolha', opcoes: ['Sim, tenho o que preciso', 'Tenho poucas', 'Não tenho, preciso de ajuda com isso'], obrigatoria: true },
    ],
  },
  {
    id: 'textos',
    pronto: 'textos',
    ligado: false,
    titulo: 'Textos do site',
    texto: 'Aqui é o que vai escrito no site. Se ainda não tem, a gente cria junto.',
    perguntas: [
      { id: 'txt-situacao', pergunta: 'Você já tem os textos do site', ajuda: '', tipo: 'escolha', opcoes: ['Sim, tenho tudo pronto', 'Tenho só uma parte', 'Não tenho, preciso que criem', 'Já tenho bastante informações no meu site, ou tenho um documento com informações'], obrigatoria: true },
      { id: 'txt-arquivo', pergunta: 'Envie o documento ou o link do seu site', ajuda: 'Pode ser o endereço do site com as informações, um perfil da empresa, ou um documento em Word, PDF ou texto.', tipo: 'arquivo', opcoes: [], obrigatoria: true, se: { id: 'txt-situacao', valor: 'Já tenho bastante informações no meu site, ou tenho um documento com informações' } },
      { id: 'txt-tom', pergunta: 'Como o texto deve soar', ajuda: 'Marque até duas.', tipo: 'varias', opcoes: ['Profissional e direto', 'Próximo e acolhedor', 'Premium e sofisticado', 'Descontraído e moderno'], obrigatoria: false },
    ],
  },
  {
    id: 'hospedagem',
    pronto: 'hospedagem',
    ligado: false,
    titulo: 'Domínio e hospedagem',
    texto: 'Para o site entrar no ar no endereço certo, sem surpresa na hora de publicar.',
    perguntas: [
      { id: 'hosp-tem', pergunta: 'Você tem um site atualmente', ajuda: '', tipo: 'escolha', opcoes: ['Sim', 'Não'], obrigatoria: true },
      { id: 'hosp-link', pergunta: 'Envie o link do seu site atual', ajuda: 'O endereço completo, começando com https://', tipo: 'link', opcoes: [], obrigatoria: true, se: { id: 'hosp-tem', valor: 'Sim' } },
      { id: 'hosp-dominio-novo', pergunta: 'Qual endereço você gostaria para o seu site', ajuda: 'Exemplo: suaempresa.com.br. Se ainda não pensou, escreva Não sei.', tipo: 'texto', opcoes: [], obrigatoria: true, se: { id: 'hosp-tem', valor: 'Não' } },
      { id: 'hosp-onde', pergunta: 'Onde o domínio foi registrado', ajuda: 'Registro.br, GoDaddy, Hostinger, Locaweb. Se não souber, escreva Não sei.', tipo: 'texto', opcoes: [], obrigatoria: false, se: { id: 'hosp-tem', valor: 'Sim' } },
      { id: 'hosp-acesso', pergunta: 'Vamos precisar do acesso do seu provedor, à sua conta atual de hospedagem.', ajuda: 'Caso não saiba onde está ou contratou alguém para fazer, entre em contato com a pessoa e solicite.', tipo: 'texto', opcoes: [], obrigatoria: true, se: { id: 'hosp-tem', valor: 'Sim' } },
      { id: 'hosp-atual', pergunta: 'Já existe hospedagem contratada', ajuda: '', tipo: 'escolha', opcoes: ['Sim', 'Não', 'Não sei'], obrigatoria: false },
      { id: 'hosp-email', pergunta: 'Usa e-mail profissional no domínio', ajuda: 'Exemplo: contato@suaempresa.com.br. É para eu não derrubar o e-mail ao publicar.', tipo: 'escolha', opcoes: ['Sim', 'Não', 'Não sei'], obrigatoria: false },
    ],
  },
  {
    id: 'google',
    pronto: 'google',
    ligado: false,
    titulo: 'Perfil da Empresa no Google',
    texto: 'O perfil que aparece no Google e no Maps quando procuram pelo seu nome.',
    perguntas: [
      { id: 'goo-existe', pergunta: 'A empresa já tem perfil no Google', ajuda: '', tipo: 'escolha', opcoes: ['Sim, e eu tenho o acesso', 'Sim, mas não tenho o acesso', 'Não tem'], obrigatoria: true },
      { id: 'goo-email', pergunta: 'Com qual e-mail o perfil foi criado', ajuda: 'O e-mail do Google que administra o perfil. Se não souber, escreva Não sei.', tipo: 'texto', opcoes: [], obrigatoria: false, se: { id: 'goo-existe', valor: ['Sim, e eu tenho o acesso', 'Sim, mas não tenho o acesso'] } },
      { id: 'goo-nome', pergunta: 'Nome da empresa como deve aparecer no Google', ajuda: 'Exatamente como você quer ler na busca.', tipo: 'texto', opcoes: [], obrigatoria: false },
      { id: 'goo-endereco', pergunta: 'O endereço aparece no perfil ou é só atendimento na região', ajuda: '', tipo: 'escolha', opcoes: ['Mostra o endereço', 'Só a região de atendimento'], obrigatoria: false },
      { id: 'goo-horario', pergunta: 'Horário de funcionamento', ajuda: 'Exemplo: de segunda a sexta, das 9h às 18h.', tipo: 'longo', opcoes: [], obrigatoria: false },
      { id: 'goo-servicos', pergunta: 'Principais serviços para listar no perfil', ajuda: 'De 3 a 8 serviços, um por linha.', tipo: 'longo', opcoes: [], obrigatoria: false },
    ],
  },
];

/* Exemplo que o cliente vê numa caixa própria, em cima do campo: quem
   não sabe como responder copia o jeito. Fica fora das perguntas acima
   para não poluir; entra aqui pelo id. */
const EXEMPLOS = {
  'cop-promessas': 'Orçamento grátis em 2 minutos\nAtendimento direto com quem faz o trabalho\nEntrega no prazo combinado, ou a gente refaz',
  'cop-fortes': '30 dias de garantia\nProdutos 100% artesanais\nEquipe especializada\nAtendimento por WhatsApp',
  'cop-numeros': '+7 anos no mercado\n+1.000 clientes atendidos\n+100 mil reais em projetos entregues',
  'cop-referencias': 'https://www.exemplo.com.br\nhttps://www.outroexemplo.com.br',
  'fol-historia': 'Comecei em 2022 pintando a janela de um cliente. Hoje temos uma equipe de 10 pessoas e atendemos a região toda.',
  'emp-servicos': 'Pintura interna e externa\nCarpintaria\nPisos\nLimpeza pós obra',
  'fol-funciona': '1. Orçamento em 2 a 3 dias úteis\n2. Aprovado, agendamos a data e combinamos o sinal\n3. Fazemos o trabalho\n4. Entrega e pagamento do restante',
  'fol-diferenciais': 'Materiais de qualidade\nCuidado com a mobília do cliente\nReparo em até 7 dias\nAtendimento de qualidade',
  'fol-garantia': 'Garantia de 1 ano contra descascamento, desde que os cuidados sejam seguidos.',
  'fol-cuidados': 'Esperar 48 horas antes de encostar nas paredes\nEvitar batidas e arranhões',
  'fol-duvidas': 'Vocês dão conta de tudo isso? Sim, tenho profissionais em cada área.',
  'goo-servicos': 'Pintura residencial\nPintura comercial\nReparos em drywall',
  'ide-publico': 'Mulheres de 30 a 50 anos, que cuidam do cabelo em casa e buscam produtos profissionais com preço justo.',
  'ide-cores': 'Gosto de tons terrosos. Não quero rosa nem azul bebê.',
  'ide-referencias': 'Aesop\nNatura\nO Boticário',
  'goo-horario': 'De segunda a sexta, das 8h às 18h. Sábado, das 8h às 12h.',
};

/* Pontos de partida para quem quer montar à mão, sem IA. Cada modelo
   liga os blocos de um tipo de trabalho; os outros ficam desligados e
   podem ser ligados na tela. */
export const MODELOS = {
  folder: { rotulo: 'Folder', blocos: ['contrato', 'empresa', 'folder', 'materiais', 'fotos'] },
  website: { rotulo: 'Website', blocos: ['contrato', 'empresa', 'materiais', 'estrutura', 'copy', 'fotos', 'textos', 'hospedagem'] },
  identidade: { rotulo: 'Identidade visual', blocos: ['contrato', 'empresa', 'identidade', 'materiais'] },
};

/* Perguntas que o cliente pode pular e mandar depois pelo WhatsApp:
   arquivo e acesso são o que mais trava quem está respondendo. */
const PULAR = new Set(['hosp-acesso', 'hosp-onde', 'goo-email']);
const podePular = (q) => PULAR.has(q.id) || q.tipo === 'arquivo';
for (const b of BLOCOS_PRONTOS) for (const q of b.perguntas) { q.pergunta = comInterrogacao(q.pergunta); q.exemplo = EXEMPLOS[q.id] || ''; q.pular = podePular(q); }

/* Texto de abertura: o mesmo em todo briefing, na voz do Samuel.
   Editável na tela de cada briefing; este é só o ponto de partida. */
export const TEXTO_ABERTURA = 'Este formulário leva de 10 a 15 minutos. É importante responder com atenção pois determinará nossa qualidade final do resultado! Assim que finalizar me confirma no Whatsapp que iniciamos a produção!';

const pronto = (id) => BLOCOS_PRONTOS.find((b) => b.id === id);

/* Esses quatro preenchem o CONTRATANTE do contrato. */
export function contratanteDasRespostas(r) {
  if (!r) return null;
  const linhas = [r.razaoSocial, r.documento, r.email, r.endereco].map(limpo).filter(Boolean);
  return linhas.length >= 2 ? linhas : null;
}

/* ---------- as perguntas do projeto, pela IA ---------- */

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['prontos', 'blocos'],
  properties: {
    prontos: {
      type: 'array',
      items: { type: 'string', enum: ['materiais', 'estrutura', 'copy', 'folder', 'identidade', 'fotos', 'textos', 'hospedagem', 'google'] },
      description: 'Blocos prontos que fazem sentido para o que foi contratado.',
    },
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
              required: ['pergunta', 'ajuda', 'exemplo', 'tipo', 'opcoes', 'obrigatoria', 'seIndice', 'seValores'],
              properties: {
                pergunta: { type: 'string' },
                ajuda: { type: 'string', description: 'Uma linha de exemplo ou explicação. Vazio se a pergunta já se explica.' },
                exemplo: { type: 'string', description: 'Resposta de exemplo, de 2 a 4 linhas, para pergunta aberta que pede lista ou formato. Vazio nas outras.' },
                tipo: { type: 'string', enum: TIPOS },
                opcoes: { type: 'array', items: { type: 'string' }, description: 'Só para "escolha" (uma) e "varias" (mais de uma). Vazio nos outros.' },
                obrigatoria: { type: 'boolean' },
                seIndice: { type: 'integer', description: 'Posição (a partir de 0) de uma pergunta de escolha ou varias ANTERIOR neste mesmo bloco, cuja resposta decide se esta pergunta aparece. -1 quando aparece sempre.' },
                seValores: { type: 'array', items: { type: 'string' }, description: 'As opções da pergunta de seIndice que fazem esta aparecer, escritas exatamente como nas opções dela. Vazio quando aparece sempre.' },
              },
            },
          },
        },
      },
    },
  },
};

/* As regras que a IA segue ficam em sementes/regras-briefing.md: o
   Samuel edita o arquivo e a próxima geração já usa. Lido a cada
   geração, de propósito (não fica em memória). */
const ARQUIVO_REGRAS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sementes', 'regras-briefing.md');
// O que fica acima da primeira linha de três traços é nota para o Samuel.
const lerRegras = async () => {
  const t = await fs.readFile(ARQUIVO_REGRAS, 'utf8');
  const i = t.indexOf('\n---\n');
  return (i >= 0 ? t.slice(i + 5) : t).trim();
};

function resumo(p) {
  return `Proposta aprovada:
- cliente: ${p.cliente || '(sem nome)'}
- o que foi contratado: ${(p.escopo || []).map((e) => e.titulo + (e.descricao ? ' (' + e.descricao + ')' : '')).join(' | ') || '(não informado)'}
- o que cada entrega inclui: ${(p.inclui?.itens || []).join(' | ') || '(não informado)'}
- investimento: ${p.investimento?.valorParcela ? `${p.investimento.parcelas}x ${p.investimento.moeda} ${p.investimento.valorParcela}` : '(não informado)'}`;
}

const idDe = (t, i) => (String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'p') + '-' + i;

export function blocosDaIa(blocosIa) {
  return (blocosIa || []).map((b, bi) => {
    // O id nasce da posição original, para a condição apontar certo mesmo
    // quando uma pergunta vazia é descartada.
    const ids = (b.perguntas || []).map((q, qi) => idDe(q.pergunta, bi * 100 + qi));
    const perguntas = [];
    (b.perguntas || []).forEach((q, qi) => {
      if (!limpo(q.pergunta)) return;
      const tipo = TIPOS.includes(q.tipo) ? q.tipo : 'texto';
      const opcoes = (q.opcoes || []).map(limpo).filter(Boolean);
      // Condição só vale se aponta para uma pergunta de escolha anterior e
      // para opções que existem nela. Qualquer coisa torta vira "sempre".
      let se;
      const alvo = Number.isInteger(q.seIndice) && q.seIndice >= 0 && q.seIndice < qi ? b.perguntas[q.seIndice] : null;
      if (alvo && ['escolha', 'varias'].includes(alvo.tipo)) {
        const validas = (q.seValores || []).map(limpo).filter((v) => (alvo.opcoes || []).map(limpo).includes(v));
        if (validas.length) se = { id: ids[q.seIndice], valor: validas.length === 1 ? validas[0] : validas };
      }
      perguntas.push({
        id: ids[qi],
        pergunta: comInterrogacao(limpo(q.pergunta)),
        ajuda: limpo(q.ajuda),
        exemplo: limpo(q.exemplo),
        pular: tipo === 'arquivo',
        tipo, opcoes,
        obrigatoria: Boolean(q.obrigatoria),
        ...(se ? { se } : {}),
      });
    });
    return { id: idDe(b.titulo, bi), ligado: true, titulo: limpo(b.titulo), texto: limpo(b.texto), perguntas };
  }).filter((b) => b.perguntas.length);
}

export async function gerarPerguntas({ proposta, transcricao }) {
  const p = proposta || {};
  const avisos = [];
  let ia = null, usado = null;

  if (temChaveIa()) {
    const partes = [{ type: 'input_text', text: resumo(p) }];
    if (transcricao) partes.push({ type: 'input_text', text: `--- Transcrição da reunião ---\n${String(transcricao).slice(0, 60000)}` });
    try {
      const r = await pedirJsonIa(partes, { sistema: await lerRegras(), esquema: ESQUEMA, nome: 'formulario_de_perguntas' });
      ia = r.ia; usado = r.modelo;
    } catch (e) { avisos.push('A IA não respondeu (' + e.message + '). O formulário saiu só com os blocos prontos.'); }
  } else {
    avisos.push('IA desligada (sem OPENAI_API_KEY): o formulário saiu só com os blocos prontos.');
  }

  const ligados = new Set(['contrato', 'empresa', ...(ia?.prontos || [])]);
  const prontos = BLOCOS_PRONTOS.map((b) => ({ ...b, ligado: ligados.has(b.id) }));

  const doProjeto = blocosDaIa(ia?.blocos);

  if (!doProjeto.length && temChaveIa() && ia) avisos.push('A IA não achou o que perguntar sobre o projeto. Só os blocos prontos foram montados.');

  const blocos = [...prontos, ...doProjeto];

  return {
    titulo: `Briefing${p.cliente ? ' | ' + p.cliente : ''}`,
    texto: TEXTO_ABERTURA,
    blocos,
    avisos,
    ia: usado,
  };
}

/* Formulário em branco, para quem quiser montar à mão sem IA. */
export function formularioVazio(p = {}) {
  const blocos = BLOCOS_PRONTOS.map((b) => ({ ...b }));
  return {
    titulo: `Briefing${p.cliente ? ' | ' + p.cliente : ''}`,
    texto: TEXTO_ABERTURA,
    blocos,
    avisos: [],
  };
}

const SE_PADRAO = {};
for (const b of BLOCOS_PRONTOS) for (const q of b.perguntas) if (q.se) SE_PADRAO[q.id] = q.se;

/* Formulário gerado antes do campo "exemplo" existir: as perguntas
   prontas recebem o exemplo padrão. Só quando o campo nunca foi
   definido; se o Samuel apagou o exemplo, o vazio dele vale. */
export function comExemplos(f) {
  const ids = new Set((f.blocos || []).flatMap((b) => (b.perguntas || []).map((q) => q.id)));
  for (const b of f.blocos || []) for (const q of b.perguntas || []) {
    // Condição de pergunta pronta que nasceu depois do formulário. `null` é
    // "sempre mostrar" escolhido de propósito no painel: esse vale.
    if (q.se === undefined && SE_PADRAO[q.id] && ids.has(SE_PADRAO[q.id].id)) q.se = SE_PADRAO[q.id];
    if (q.exemplo === undefined) q.exemplo = EXEMPLOS[q.id] || '';
    if (q.pular === undefined) q.pular = podePular(q);
  }
  return f;
}

/* Blocos que o cliente vê: os ligados, com pergunta de verdade. */
export const blocosAtivos = (f) => (f.blocos || [])
  .filter((b) => b.ligado !== false && (b.perguntas || []).some((q) => q.pergunta))
  .map((b) => ({ ...b, perguntas: b.perguntas.filter((q) => q.pergunta) }));

/* ---------- a página que o cliente abre ---------- */

// Setas dos botões principais: a mesma linha fina do resto do site.
const SETA_DIR = '<svg class="pg-seta pg-seta--dir" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function campo(q) {
  const req = q.obrigatoria ? ' required' : '';
  const n = esc(q.id);
  if (q.tipo === 'arquivo') {
    // Duas saídas, sempre: subir o arquivo ou colar um link. O link não tem
    // `name`: quem junta os dois na resposta é o briefing.js.
    return `<div class="pg-upload" data-upload="${n}">
      <input type="file" id="${n}" name="${n}" multiple hidden>
      <button class="pg-upload__alvo" type="button">
        <svg class="pg-upload__ico" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><path d="M8 11V3M5 6l3-3 3 3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <b>Enviar arquivos</b>
        <span>Toque aqui ou arraste para cá. Até 20 MB por arquivo.</span>
      </button>
      <ul class="pg-upload__lista"></ul>
      <p class="pg-ou"><span>ou</span></p>
      <input type="url" class="pg-upload__link" data-link-de="${n}" placeholder="Cole um link (Drive, Dropbox, WeTransfer)" aria-label="Ou cole um link">
    </div>`;
  }
  if (q.tipo === 'longo') return `<textarea id="${n}" name="${n}" rows="4"${req}></textarea>`;
  if ((q.tipo === 'escolha' || q.tipo === 'varias') && q.opcoes?.length) {
    const uma = q.tipo === 'escolha';
    return `<div class="pg-opcoes">${q.opcoes.map((o, i) => `
      <label class="pg-opcao"><input type="${uma ? 'radio' : 'checkbox'}" name="${n}" value="${esc(o)}"${uma && i === 0 && q.obrigatoria ? ' required' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
  }
  const tipo = q.tipo === 'email' ? 'email' : q.tipo === 'link' ? 'url' : q.tipo === 'telefone' ? 'tel' : 'text';
  const dica = q.tipo === 'link' ? ' placeholder="https://"' : q.tipo === 'telefone' ? ' placeholder="(00) 00000-0000"' : q.tipo === 'email' ? ' placeholder="email@exemplo.com"' : '';
  return `<input type="${tipo}" id="${n}" name="${n}"${dica}${req}>`;
}

/* A página nasce como um formulário inteiro, visível e legível sem
   JavaScript (regra 2.4). Com JavaScript, briefing.js transforma
   cada pergunta numa tela e o formulário vira o quiz, etapa por
   etapa. Nada de conteúdo depende do script para existir. */
export function renderizarPerguntas(f, { respondido = false } = {}) {
  const ativos = blocosAtivos(f);

  const blocos = ativos.map((b, i) => `
  <section class="pg-bloco" data-etapa="${i}" data-nome="${esc(b.titulo)}">
    <p class="eyebrow pg-bloco__n">${String(i + 1).padStart(2, '0')} ${esc(b.titulo)}</p>
    ${b.texto ? `<p class="pg-bloco__texto">${esc(b.texto)}</p>` : ''}
    ${b.perguntas.map((q) => `
    <div class="pg-campo" data-tipo="${esc(q.tipo)}"${q.obrigatoria ? ' data-obrigatoria="1"' : ''}${q.pular ? ' data-pular="1"' : ''}${q.se?.id ? ` data-se-id="${esc(q.se.id)}" data-se-valor="${esc(JSON.stringify([].concat(q.se.valor)))}"` : ''}>
      <label for="${esc(q.id)}">${esc(comInterrogacao(q.pergunta))}${q.obrigatoria ? '' : ' <small>(opcional)</small>'}</label>
      ${q.ajuda ? `<p class="pg-ajuda">${esc(q.ajuda)}</p>` : ''}
      ${q.exemplo ? `<aside class="pg-exemplo"><p class="pg-exemplo__rot">Exemplo</p><p class="pg-exemplo__txt">${esc(q.exemplo)}</p></aside>` : ''}
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
${metaCompartilhar({
  titulo: f.titulo || 'Briefing do projeto',   // já vem como "Briefing | Cliente"
  descricao: 'Responda uma pergunta por vez, no seu ritmo. Leva de 10 a 15 minutos e o que você já respondeu fica salvo.',
  imagem: 'briefing',
  caminho: f.link ? `/perguntas/${f.link}` : '/',
  alt: 'Briefing do projeto, Samuel Freire',
})}
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/base.css">
<link rel="stylesheet" href="/styles/perguntas.css?v=q21">
<link rel="icon" href="/img/favicon.png">
</head>
<body class="perguntas">

<header class="pg-topo">
  <div class="pg-topo__in">
    <span class="pg-marca">Samuel<em>Freire</em></span>
    <span class="pg-passo" id="passo" hidden></span>
  </div>
  <div class="pg-regua" id="regua" hidden><i id="regua-cheia"></i></div>
</header>

<main class="pg-palco" id="palco">

  <section class="pg-tela pg-tela--capa" id="capa">
    <p class="eyebrow pg-eyebrow">Briefing do projeto</p>
    <h1 class="pg-titulo">${esc(f.titulo || 'Informações para começar')}</h1>
    ${f.texto ? `<p class="pg-sub">${esc(f.texto)}</p>` : ''}
    <div class="pg-acoes">
      <button class="btn btn--brand pg-avancar" type="button" id="comecar" hidden>Começar ${SETA_DIR}</button>
    </div>
  </section>

  <div class="pg-feito" id="feito"${respondido ? '' : ' hidden'}>
    <p class="eyebrow pg-eyebrow">Recebido</p>
    <p class="pg-feito__t">Obrigado! Já tenho tudo o que preciso.</p>
    <p class="pg-sub">Agora é comigo. Qualquer dúvida no caminho, eu te chamo.</p>
  </div>

  <form id="form" class="pg-form"${respondido ? ' hidden' : ''} novalidate>
    ${blocos}
    <p class="pg-erro" id="erro" hidden></p>
    <div class="pg-acoes" id="acoes-fim">
      <button class="btn btn--brand" type="submit" id="enviar">Enviar as informações ${SETA_DIR}</button>
      <span class="pg-nota">Suas respostas vão direto para o Samuel.</span>
    </div>
  </form>
</main>

<footer class="pg-rodape"><p class="small">Samuel Freire Web Designer</p></footer>

<script type="module" src="/js/briefing.js?v=q21"></script>
</body>
</html>`;
}
