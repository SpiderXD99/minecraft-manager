#!/bin/bash

#./dev.sh [comando]

case "$1" in
  start|up)
    echo "🚀 Avvio Minecraft Manager..."
    docker compose up -d --build
    echo "✅ Server avviato su http://localhost:3000"
    ;;

  stop|down)
    echo "🛑 Arresto Minecraft Manager..."
    docker compose down
    echo "✅ Server arrestato"
    ;;

  restart)
    echo "🔄 Riavvio Minecraft Manager..."
    docker compose restart
    echo "✅ Server riavviato"
    ;;

  logs)
    echo "📋 Log (Ctrl+C per uscire)..."
    docker compose logs -f minecraft-manager
    ;;

  rebuild)
    echo "🔨 Rebuild..."
    docker compose down
    docker compose build --no-cache
    docker compose up -d
    echo "✅ Rebuild completato"
    ;;

  shell)
    echo "🐚 Shell nel container..."
    docker compose exec minecraft-manager sh
    ;;

  *)
    echo "Minecraft Manager"
    echo ""
    echo "Uso: ./dev.sh [comando]"
    echo ""
    echo "Comandi:"
    echo "  start/up  - Avvia il server"
    echo "  stop/down - Ferma il server"
    echo "  restart   - Riavvia il server"
    echo "  logs      - Mostra i log"
    echo "  rebuild   - Rebuild completo"
    echo "  shell     - Apri shell nel container"
    echo ""
    exit 1
    ;;
esac
