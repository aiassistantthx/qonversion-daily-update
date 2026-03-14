/**
 * Import missing events from Qonversion CSV export
 */

const fs = require('fs');
const path = require('path');

const CSV_FILE = process.argv[2] || '/Users/ivorobyev/Downloads/q-export-20260314124011-zXn4UplyyB1oP3.csv';
const API_URL = 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const events = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const event = {};
    headers.forEach((header, idx) => {
      event[header] = values[idx] || '';
    });
    events.push(event);
  }

  return events;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function transformEvent(csvEvent) {
  return {
    transaction_id: csvEvent['Transaction ID'] || null,
    event_date: csvEvent['Event Date'],
    event_name: csvEvent['Event Name'],
    q_user_id: csvEvent['Q User ID'],
    product_id: csvEvent['Product ID'] || null,
    price_usd: parseFloat(csvEvent['Price USD']) || 0,
    refund: csvEvent['Refund'] === 'true',
    platform: csvEvent['Platform'] || 'iOS',
    country: csvEvent['Country'] || null,
    install_date: csvEvent['Install Date'] || null,
    media_source: csvEvent['Media source'] || null,
    campaign_name: csvEvent['Campaign'] || null,
    app_version: csvEvent['App version'] || null,
  };
}

async function importEvents() {
  console.log(`Reading CSV: ${CSV_FILE}`);
  const content = fs.readFileSync(CSV_FILE, 'utf-8');
  const csvEvents = parseCSV(content);
  console.log(`Parsed ${csvEvents.length} events from CSV`);

  const events = csvEvents.map(transformEvent);
  console.log(`Transformed ${events.length} events for import`);

  // Filter out events without q_user_id
  const validEvents = events.filter(e => e.q_user_id);
  console.log(`Valid events (with q_user_id): ${validEvents.length}`);

  // Import via API
  console.log('Importing events via API...');
  const response = await fetch(`${API_URL}/webhook/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ events: validEvents }),
  });

  const result = await response.json();
  console.log('Import result:', result);
}

importEvents().catch(console.error);
