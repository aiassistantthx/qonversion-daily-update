#!/usr/bin/env node

/**
 * ASA CLI - Apple Search Ads Management Tool
 *
 * Usage:
 *   asa-cli campaigns list [--status=active]
 *   asa-cli campaigns pause <id>
 *   asa-cli keywords list <campaign_id> <adgroup_id>
 *   asa-cli keywords bid <keyword_id> <new_bid> --campaign=X --adgroup=Y
 *   asa-cli keywords bid-bulk --file=bids.csv [--dry-run]
 *   asa-cli rules list
 *   asa-cli rules create --file=rule.json
 *   asa-cli sync [--days=7]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Command } = require('commander');
const fs = require('fs');

// Import commands
const campaignsCommand = require('./commands/campaigns');
const keywordsCommand = require('./commands/keywords');
const rulesCommand = require('./commands/rules');
const syncCommand = require('./commands/sync');
const templatesCommand = require('./commands/templates');

const program = new Command();

program
  .name('asa-cli')
  .description('Apple Search Ads Management CLI')
  .version('1.0.0');

// Add commands
program.addCommand(campaignsCommand);
program.addCommand(keywordsCommand);
program.addCommand(rulesCommand);
program.addCommand(syncCommand);
program.addCommand(templatesCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
