`#!/bin/bash
# Duplo clique para abrir a demonstração do Tawper OS no Chrome.
cd "$(dirname "$0")/web" || exit 1
PORT=4100
echo "Tawper OS — preparando a demonstração…"
if [ ! -d node_modules ]; then
  echo "Instalando dependências (só na primeira vez)…"
  npm install || exit 1
fi
if [ ! -f .next/BUILD_ID ]; then
  echo "Gerando a versão otimizada (só na primeira vez)…"
  npm run build || exit 1
fi
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  nohup npm run start > /tmp/tawpe`r-os.log 2>&1 &
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT" && break; sleep 0.5; done
fi
open -a "Google Chrome" "http://localhost:$P`ORT" 2>/dev/null || open "http://localhost:$PORT"
echo ""
echo "Pronto: http://localhost:$PORT"
echo "Pode fechar esta janela — o sistema continua rodando."
echo "Para desligar, use \"Parar Tawper OS.command\"."
``