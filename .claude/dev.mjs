/* ============================================================
   Sobe o servidor para a prévia do Claude Code.

   Antes o launch.json chamava `sh -c "env ... node"`, e no Windows
   não existe sh nem bash no PATH do lançador. Aqui é Node puro:
   define as variáveis que a stack define em produção e passa a bola
   pro servidor de verdade. Só de desenvolvimento, nada disso entra
   na imagem (o Dockerfile copia apenas servidor/ e site/).
   ============================================================ */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');
const alvo = path.join(raiz, 'servidor', 'servidor.js');

/* O servidor é ESM num arquivo .js sem package.json. Do Node 22.7 em
   diante isso é reconhecido sozinho; antes disso precisa da bandeira. */
const [maior, menor] = process.versions.node.split('.').map(Number);
const bandeiras = (maior > 22 || (maior === 22 && menor >= 7)) ? [] : ['--experimental-detect-module'];

const filho = spawn(process.execPath, [...bandeiras, alvo], {
  cwd: raiz,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORTA: process.env.PORT || process.env.PORTA || '3000',
    PASTA_DADOS: process.env.PASTA_DADOS || path.join(raiz, 'dados-local'),
    SENHA_PAINEL: process.env.SENHA_PAINEL || 'local',
  },
});

filho.on('exit', (codigo, sinal) => process.exit(sinal ? 1 : (codigo ?? 0)));
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => filho.kill(sinal));
