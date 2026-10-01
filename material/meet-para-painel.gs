/* ============================================================
   Meet para o painel.

   Roda dentro da sua conta Google (script.google.com). A cada 5
   minutos procura no Drive as transcrições novas do Meet e manda o
   texto para o painel, onde elas aparecem em Propostas, na caixa
   "Reuniões".

   Como instalar, uma vez só:
     1. No Portainer, na stack, crie a variável TOKEN_REUNIOES com
        uma senha longa inventada por você e atualize a stack.
     2. Abra script.google.com, clique em "Novo projeto", apague o
        que estiver lá e cole este arquivo inteiro.
     3. Troque o TOKEN abaixo pela mesma senha do passo 1.
     4. No alto, escolha a função "instalar" e clique em Executar.
        O Google pede autorização para ler o Drive: aceite.
   Pronto. Para parar, rode a função "desinstalar".

   O script só lê documentos cujo nome parece transcrição (lista
   PALAVRAS) e só manda cada um uma vez.
   ============================================================ */

const PAINEL = 'https://links.samuelfreire.com.br/api/reunioes/entrada';
const TOKEN = 'COLE-AQUI-A-SENHA-DO-TOKEN_REUNIOES';
const PALAVRAS = ['Transcript', 'Transcrição'];   // como o Meet nomeia o documento
const HORAS = 48;                                  // olha só o que mudou nas últimas 48 horas

function enviarNovas() {
  const enviados = PropertiesService.getScriptProperties();
  const desde = new Date(Date.now() - HORAS * 3600 * 1000).toISOString();
  const nomes = PALAVRAS.map(function (p) { return "title contains '" + p + "'"; }).join(' or ');
  const busca = "mimeType = 'application/vnd.google-apps.document' and trashed = false"
    + " and modifiedDate > '" + desde + "' and (" + nomes + ')';
  const arquivos = DriveApp.searchFiles(busca);

  while (arquivos.hasNext()) {
    const arquivo = arquivos.next();
    const id = arquivo.getId();
    if (enviados.getProperty(id)) continue;

    const texto = textoDe(id);
    if (texto.trim().length < 200) continue;   // vazia ou ainda sendo escrita: tenta na próxima rodada

    const resposta = UrlFetchApp.fetch(PAINEL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-token': TOKEN },
      payload: JSON.stringify({ origem: id, titulo: arquivo.getName(), data: arquivo.getDateCreated().toISOString(), texto: texto }),
      muteHttpExceptions: true,
    });
    if (resposta.getResponseCode() === 200) enviados.setProperty(id, new Date().toISOString());
    else console.error('O painel recusou "' + arquivo.getName() + '": ' + resposta.getResponseCode() + ' ' + resposta.getContentText());
  }
}

// O documento do Meet pode ter abas (anotações e transcrição): junta todas.
function textoDe(id) {
  const doc = DocumentApp.openById(id);
  const abas = doc.getTabs ? doc.getTabs() : [];
  if (!abas.length) return doc.getBody().getText();
  return abas.map(function (a) { return a.asDocumentTab().getBody().getText(); }).join('\n\n');
}

function instalar() {
  desinstalar();
  ScriptApp.newTrigger('enviarNovas').timeBased().everyMinutes(5).create();
  enviarNovas();
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === 'enviarNovas') ScriptApp.deleteTrigger(g);
  });
}
