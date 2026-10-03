#!/bin/sh
# Gera as imagens de preview do WhatsApp em site/img/og-*.png.
# Precisa do Google Chrome instalado. Rode na raiz do projeto:
#   sh material/og/gerar.sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
for v in site global proposta briefing fatura; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,630 --virtual-time-budget=4000 \
    --allow-file-access-from-files \
    --screenshot="$RAIZ/site/img/og-$v.png" "file://$AQUI/og.html?v=$v" >/dev/null 2>&1
  echo "og-$v.png: $(wc -c < "$RAIZ/site/img/og-$v.png") bytes"
done
