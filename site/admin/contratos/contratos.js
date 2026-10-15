/* ============================================================
   Contratos: o mesmo gerador da proposta, com as fontes à escolha.
   Proposta (obrigatória), formulário, qual resposta e qual reunião.
   O contrato continua um por proposta (/contratos/<id> vira o PDF).
   ============================================================ */

const $ = (s) => document.querySelector(s);
const data = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';

async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  if (r.status === 401) { location.replace('/admin/entrar?voltar=/admin/contratos/'); throw new Error('Faça login.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Algo deu errado.');
  return d;
}

let timer;
function avisar(txt, tipo = 'ok') {
  const el = $('#aviso');
  el.textContent = txt; el.dataset.tipo = tipo; el.classList.add('mostra');
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove('mostra'), 3500);
}

// [[valor, texto], ...] no select, escolhendo `atual` se existir.
function opcoes(sel, lista, atual = '') {
  sel.replaceChildren(...lista.map(([v, t]) => new Option(t, v)));
  sel.value = lista.some(([v]) => v === atual) ? atual : (lista[0]?.[0] ?? '');
}

let propostas = [], formularios = [], reunioes = [];

function pintarContrato(c) {
  $('#texto').value = c.texto || '';
  $('#meta').textContent = c.atualizadoEm ? 'Salvo em ' + new Date(c.atualizadoEm).toLocaleString('pt-BR') : '';
  $('#avisos').hidden = !c.avisos?.length;
  $('#avisos').textContent = (c.avisos || []).join(' ');
}

async function trocarFormulario() {
  const id = $('#formulario').value;
  if (!id) return opcoes($('#envio'), [['', 'Nenhuma']]);
  const f = await api('/api/formularios/' + encodeURIComponent(id));
  // Concluídas primeiro, da mais nova; a primeira já vem escolhida.
  const chave = (e) => (e.concluidoEm ? '1' : '0') + (e.concluidoEm || e.atualizadoEm || '');
  const envios = (f.envios || []).slice().sort((a, b) => chave(b).localeCompare(chave(a)));
  opcoes($('#envio'), envios.length
    ? envios.map((e) => [e.id, (e.respostas?.razaoSocial || 'Resposta') + ' · ' + data(e.concluidoEm || e.atualizadoEm) + (e.concluidoEm ? '' : ' (parcial)')])
    : [['', 'Ainda sem resposta']]);
}

async function trocarProposta() {
  const p = propostas.find((x) => x.id === $('#proposta').value);
  if (!p) return;
  $('#pdf').href = '/contratos/' + encodeURIComponent(p.id) + '?imprimir=1';
  // Já vem com o que é dessa proposta; dá para trocar.
  $('#formulario').value = formularios.some((f) => f.id === p.id) ? p.id : '';
  $('#reuniao').value = reunioes.some((r) => r.id === p.reuniao) ? p.reuniao : '';
  await trocarFormulario();
  pintarContrato(await api('/api/contratos/' + encodeURIComponent(p.id)));
}

async function gerar() {
  if ($('#texto').value.trim() && !confirm('Gerar de novo troca o texto atual. O que você editou à mão se perde. Continuar?')) return;
  const b = $('#gerar');
  b.disabled = true; b.textContent = 'Gerando…';
  try {
    const c = await api('/api/contratos/' + encodeURIComponent($('#proposta').value) + '/gerar', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ formulario: $('#formulario').value, envio: $('#envio').value, reuniao: $('#reuniao').value }),
    });
    pintarContrato(c);
    avisar('Contrato gerado. Confira antes de enviar.');
  } catch (e) { avisar(e.message, 'erro'); }
  finally { b.disabled = false; b.textContent = 'Gerar contrato'; }
}

async function salvar() {
  try {
    pintarContrato(await api('/api/contratos/' + encodeURIComponent($('#proposta').value), {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: $('#texto').value }),
    }));
    avisar('Texto salvo.');
  } catch (e) { avisar(e.message, 'erro'); }
}

async function iniciar() {
  [{ propostas }, { formularios }, { reunioes }] = await Promise.all([api('/api/propostas'), api('/api/formularios'), api('/api/reunioes')]);
  if (!propostas.length) { $('#texto').placeholder = 'Nenhuma proposta ainda. Crie uma em Propostas.'; return; }
  opcoes($('#proposta'), propostas.map((p) => [p.id, (p.cliente || p.id) + (p.titulo ? ' · ' + p.titulo : '')]), new URLSearchParams(location.search).get('proposta') || '');
  opcoes($('#formulario'), [['', 'Nenhum'], ...formularios.map((f) => [f.id, (f.titulo || 'Formulário') + (f.cliente ? ' · ' + f.cliente : '') + (f.total ? '' : ' (sem resposta)')])]);
  opcoes($('#reuniao'), [['', 'Nenhuma'], ...reunioes.map((r) => [r.id, (r.titulo || 'Reunião') + ' · ' + data(r.data || r.recebidaEm)])]);
  $('#proposta').onchange = () => trocarProposta().catch((e) => avisar(e.message, 'erro'));
  $('#formulario').onchange = () => trocarFormulario().catch((e) => avisar(e.message, 'erro'));
  $('#gerar').onclick = gerar;
  $('#salvar').onclick = salvar;
  await trocarProposta();
}

iniciar().catch((e) => avisar(e.message, 'erro'));
