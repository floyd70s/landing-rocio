#!/bin/bash
# Doble clic para iniciar la landing (abre http://localhost:4000). Requiere SGA corriendo en el puerto 3100.
cd "$(dirname "$0")" || exit 1
for d in $(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -rV) /opt/homebrew/bin /usr/local/bin; do [ -x "$d/node" ] && export PATH="$d:$PATH" && break; done
command -v node >/dev/null || { echo "Instale Node.js (https://nodejs.org)"; read -r -p "Enter para cerrar"; exit 1; }
(sleep 2; open "http://localhost:4000") &
node serve.js
