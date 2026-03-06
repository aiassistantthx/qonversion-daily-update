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
