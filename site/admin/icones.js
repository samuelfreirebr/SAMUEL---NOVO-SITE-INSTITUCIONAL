/* ============================================================
   Ícones dos botões do painel: traço fino de 1.5, 16px, na cor do
   texto. Poucos e só onde ajudam a achar o botão (copiar, abrir,
   apagar, salvar), não em todos. Uso: ico('copiar').
   ============================================================ */

const DESENHOS = {
  copiar: 'M6 3h7v8H6z M3 6v7h7',
  abrir: 'M9 3h4v4 M13 3 7 9 M11 9.5V13H3V5h3.5',
  editar: 'M3 13l.8-3L11 2.8 13.2 5 6 12.2z M9.8 4 12 6.2',
  respostas: 'M2 9.5 4 3h8l2 6.5V13H2z M2 9.5h3.5l1 1.5h3l1-1.5H14',
  apagar: 'M3 5h10 M6 5V3h4v2 M4.5 5l.6 8h5.8l.6-8',
  mais: 'M8 3v10 M3 8h10',
  modelo: 'M2.5 3h11v10h-11z M2.5 7h11 M7 7v6',
  ia: 'M8 2l1.4 4.1L13.5 7.5 9.4 9 8 13 6.6 9 2.5 7.5 6.6 6.1z',
  salvar: 'M3 8.5l3.5 3.5L13 4.5',
  elo: 'M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6 M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6',
  enviar: 'M8 11V3 M5 6l3-3 3 3 M3 13h10',
  voltar: 'M13 8H3 M7 4 3 8l4 4',
  formulario: 'M4 2h8v12H4z M6.2 5.5h3.6 M6.2 8h3.6 M6.2 10.5h2',
  olho: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 9.7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
};

export function ico(nome) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', DESENHOS[nome] || DESENHOS.mais);
  svg.append(p);
  return svg;
}
