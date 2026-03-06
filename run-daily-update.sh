#!/bin/bash

# Daily Update Runner for Qonversion → Google Sheets
# Запускается автоматически каждый день в 9:00

SCRIPT_DIR="$HOME/scripts/qonversion"
LOG_FILE="$SCRIPT_DIR/cron.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting daily update..." >> "$LOG_FILE"

cd "$SCRIPT_DIR"

# Проверяем что auth.json существует
if [ ! -f "auth.json" ]; then
    echo "[$DATE] ERROR: auth.json not found. Run 'node login.js' first." >> "$LOG_FILE"
    exit 1
fi

# Запускаем основной скрипт
/opt/homebrew/bin/node daily-update.js >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
DATE_END=$(date '+%Y-%m-%d %H:%M:%S')

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$DATE_END] Daily update completed successfully." >> "$LOG_FILE"
else
    echo "[$DATE_END] Daily update FAILED with exit code $EXIT_CODE" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
