const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(process.env.HOME, '.claude/gdrive-creds/gcp-oauth.keys.json');
const TOKEN_PATH = path.join(process.env.HOME, '.claude/gdrive-creds/.gdrive-server-credentials.json');

class SheetsUpdater {
  constructor(spreadsheetId) {
    this.spreadsheetId = spreadsheetId;
    this.sheets = null;
  }

  async init() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

    const { client_id, client_secret } = credentials.installed;
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
    oauth2Client.setCredentials(token);

    this.sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    return this;
  }

  // Update a single cell with proper number formatting
  async updateCell(range, value) {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: range,
      valueInputOption: 'USER_ENTERED', // This parses numbers as numbers!
      requestBody: {
        values: [[value]]
      }
    });
  }

  // Batch update multiple cells efficiently
  async batchUpdate(updates) {
    // updates = [{ range: 'Sheet!A1', value: 123 }, ...]
    const data = updates.map(u => ({
      range: u.range,
      values: [[u.value]]
    }));

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: data
      }
    });

    return updates.length;
  }

  // Read a range
  async readRange(range) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: range
    });
    return response.data.values;
  }

  // Получить информацию о листе (количество колонок, sheetId)
  async getSheetInfo(sheetName) {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets(properties)'
    });

    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    return {
      sheetId: sheet.properties.sheetId,
      rowCount: sheet.properties.gridProperties.rowCount,
      columnCount: sheet.properties.gridProperties.columnCount
    };
  }

  // Добавить колонки в конец листа
  async appendColumns(sheetId, count) {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          appendDimension: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            length: count
          }
        }]
      }
    });
  }

  // Копировать колонку с форматированием и формулами
  // sourceColumnIndex - индекс колонки (0-based)
  // targetColumnIndex - индекс целевой колонки (0-based)
  async copyColumn(sheetId, sourceColumnIndex, targetColumnIndex) {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          copyPaste: {
            source: {
              sheetId: sheetId,
              startColumnIndex: sourceColumnIndex,
              endColumnIndex: sourceColumnIndex + 1,
              startRowIndex: 0,
              endRowIndex: 100 // Копируем первые 100 строк
            },
            destination: {
              sheetId: sheetId,
              startColumnIndex: targetColumnIndex,
              endColumnIndex: targetColumnIndex + 1,
              startRowIndex: 0,
              endRowIndex: 100
            },
            pasteType: 'PASTE_NORMAL', // Копирует всё: значения, формулы, форматирование
            pasteOrientation: 'NORMAL'
          }
        }]
      }
    });
  }

  // Расширить таблицу до нужной колонки и скопировать последнюю заполненную колонку
  // baseDate - дата первой новой колонки (для обновления заголовков)
  async ensureColumnsExist(sheetName, requiredColumnIndex, lastFilledColumnIndex, baseDate = null) {
    const info = await this.getSheetInfo(sheetName);

    // Если колонок уже достаточно - ничего не делаем
    if (info.columnCount >= requiredColumnIndex) {
      return { added: 0, copied: 0 };
    }

    // Сколько колонок нужно добавить (ровно столько, сколько не хватает)
    const columnsToAdd = requiredColumnIndex - info.columnCount;

    console.log(`[Sheets] Adding ${columnsToAdd} columns (current: ${info.columnCount}, required: ${requiredColumnIndex})`);

    // Добавляем колонки
    await this.appendColumns(info.sheetId, columnsToAdd);

    // Копируем последнюю заполненную колонку во все новые
    const newColumnsStart = info.columnCount; // 0-based index первой новой колонки
    const newColumnsEnd = info.columnCount + columnsToAdd;

    let copied = 0;
    for (let i = newColumnsStart; i < newColumnsEnd; i++) {
      await this.copyColumn(info.sheetId, lastFilledColumnIndex, i);
      copied++;
    }

    console.log(`[Sheets] Copied column ${lastFilledColumnIndex} to ${copied} new columns`);

    // Обновляем заголовки дат для новых колонок (строка 1)
    if (baseDate) {
      const headerUpdates = [];
      for (let i = 0; i < columnsToAdd; i++) {
        const colIndex = info.columnCount + i + 1; // 1-based для columnIndexToLetter
        const colLetter = this._columnIndexToLetter(colIndex);

        // Вычисляем дату для этой колонки
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);
        const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;

        headerUpdates.push({
          range: `${sheetName}!${colLetter}1`,
          value: dateStr
        });
      }

      if (headerUpdates.length > 0) {
        await this.batchUpdate(headerUpdates);
        console.log(`[Sheets] Updated ${headerUpdates.length} date headers`);
      }
    }

    return { added: columnsToAdd, copied };
  }

  // Вспомогательная функция для преобразования индекса в букву
  _columnIndexToLetter(index) {
    let result = '';
    while (index > 0) {
      index--;
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26);
    }
    return result;
  }
}

module.exports = SheetsUpdater;

// Test if run directly
if (require.main === module) {
  (async () => {
    const updater = new SheetsUpdater('1XGhckU9SJfGXK94JFVBIpAuoCBoybBSKVnT0Q4mqKwM');
    await updater.init();

    // Test: fix AI93
    console.log('Fixing AI93...');
    await updater.updateCell('fact!AI93', 4301);
    console.log('Done! Check if apostrophe is gone.');
  })();
}
