# ============================================================
#  Site + painel + propostas, num container só.
#
#  Node puro, sem dependência nenhuma: não há npm install, não
#  há build. O que entra na imagem é só site/ e servidor/ —
#  .git, material/ e cloudflare-antigo/ ficam de fora.
# ============================================================

FROM node:22-alpine

WORKDIR /app

# Só o que roda. Um "COPY . ." publicaria o .git inteiro, e foi
# assim que o repositório vazou no deploy anterior.
COPY servidor/ ./servidor/
COPY site/     ./site/

# Os dados ficam no volume. A pasta é criada aqui e entregue ao
# usuário sem privilégio, senão o container não consegue gravar.
RUN mkdir -p /dados && chown -R node:node /dados /app
USER node

ENV PORTA=3000 \
    PASTA_SITE=/app/site \
    PASTA_DADOS=/dados \
    NODE_ENV=production

EXPOSE 3000
VOLUME ["/dados"]

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/estado').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "servidor/servidor.js"]
