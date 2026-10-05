#!/bin/bash
# Desliga o servidor da demonstração do Tawper OS (porta 4100).
PIDS=$(lsof -tiTCP:4100 -sTCP:LISTEN)
if [ -n "$PIDS" ]; then
  kill $PIDS && echo "Tawper OS desligado."
else
  echo "O Tawper OS não estava rodando."
fi
