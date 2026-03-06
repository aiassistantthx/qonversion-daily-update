const SheetsUpdater = require('./sheets-updater');

const SPREADSHEET_ID = '1XGhckU9SJfGXK94JFVBIpAuoCBoybBSKVnT0Q4mqKwM';

// All data to fix
const cohorts = {
  'B93': 45493, 'C93': 147771, 'D93': 144167, 'E93': 184083,
  'F93': 126057, 'G93': 213841, 'H93': 116517, 'I93': 101017,
  'J93': 99998, 'K93': 34791, 'L93': 21451, 'M93': 31329,
  'N93': 25307, 'O93': 18971, 'P93': 26840, 'Q93': 43493,
  'R93': 37469, 'S93': 34106, 'T93': 36296, 'U93': 49300,
  'V93': 50933, 'W93': 44310, 'X93': 53093, 'Y93': 65182,
  'Z93': 52760, 'AA93': 49036, 'AB93': 33232, 'AC93': 46690,
  'AD93': 72430, 'AE93': 62597, 'AF93': 48243, 'AG93': 51300,
  'AH93': 34714
};

const appleAds = {
  'AMQ7': 1400, 'AMR7': 1500, 'AMS7': 2200, 'AMT7': 2000,
  'AMU7': 1900, 'AMV7': 1700, 'AMW7': 2000, 'AMX7': 878
};

const sales = {
  'AMQ19': 4762, 'AMR19': 3480, 'AMS19': 4172, 'AMT19': 4198,
  'AMU19': 3749, 'AMV19': 4029, 'AMW19': 4021, 'AMX19': 3497
};

const trials = {
  'AMQ55': 158, 'AMR55': 162, 'AMS55': 225, 'AMT55': 183,
  'AMU55': 196, 'AMV55': 216, 'AMW55': 188, 'AMX55': 96
};

const yearlySubs = {
  'AMQ58': 13, 'AMR58': 9, 'AMS58': 13, 'AMT58': 14,
  'AMU58': 17, 'AMV58': 14, 'AMW58': 16, 'AMX58': 7
};

const trialToPaid = {
  'AMQ64': 0.1012, 'AMR64': 0.1172, 'AMS64': 0.1066,
  'AMT64': 0.1475, 'AMU64': 0.1581
};

(async () => {
  const updater = new SheetsUpdater(SPREADSHEET_ID);
  await updater.init();

  // Combine all updates
  const allData = { ...cohorts, ...appleAds, ...sales, ...trials, ...yearlySubs, ...trialToPaid };

  const updates = Object.entries(allData).map(([cell, value]) => ({
    range: `fact!${cell}`,
    value: value
  }));

  console.log(`Fixing ${updates.length} cells...`);

  // Batch update in chunks of 50 (API limit)
  const chunkSize = 50;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    await updater.batchUpdate(chunk);
    console.log(`  Updated ${Math.min(i + chunkSize, updates.length)}/${updates.length}`);
  }

  console.log('Done! All cells fixed.');
})();
