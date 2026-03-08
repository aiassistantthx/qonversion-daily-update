/**
 * Templates Command
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const db = require('../../api/db');

const program = new Command('templates')
  .description('Manage campaign templates');

// List templates
program
  .command('list')
  .description('List all templates')
  .option('--type <type>', 'Filter by type (campaign, adgroup, full)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      let query = 'SELECT * FROM asa_campaign_templates';
      const params = [];

      if (options.type) {
        params.push(options.type);
        query += ` WHERE template_type = $1`;
      }

      query += ' ORDER BY times_used DESC, created_at DESC';

      const result = await db.query(query, params);

      if (options.json) {
        console.log(JSON.stringify(result.rows, null, 2));
        return;
      }

      console.log('\nCampaign Templates:');
      console.log('─'.repeat(90));
      console.log(
        'ID'.padEnd(5) +
        'Name'.padEnd(35) +
        'Type'.padEnd(12) +
        'Keywords'.padEnd(10) +
        'Used'.padEnd(8) +
        'Created'.padEnd(20)
      );
      console.log('─'.repeat(90));

      for (const tpl of result.rows) {
        const keywords = typeof tpl.keywords === 'string'
          ? JSON.parse(tpl.keywords)
          : tpl.keywords || [];
        const created = new Date(tpl.created_at).toISOString().slice(0, 10);

        console.log(
          String(tpl.id).padEnd(5) +
          (tpl.name || '').substring(0, 33).padEnd(35) +
          (tpl.template_type || '').padEnd(12) +
          String(keywords.length).padEnd(10) +
          String(tpl.times_used || 0).padEnd(8) +
          created.padEnd(20)
        );
      }

      console.log('─'.repeat(90));
      console.log(`Total: ${result.rows.length} templates\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Get template details
program
  .command('get <templateId>')
  .description('Get template details')
  .option('--json', 'Output as JSON')
  .action(async (templateId, options) => {
    try {
      const result = await db.query('SELECT * FROM asa_campaign_templates WHERE id = $1', [templateId]);

      if (result.rows.length === 0) {
        console.error('Template not found');
        process.exit(1);
      }

      const template = result.rows[0];

      if (options.json) {
        console.log(JSON.stringify(template, null, 2));
        return;
      }

      console.log('\nTemplate Details:');
      console.log('─'.repeat(60));
      console.log(`ID:          ${template.id}`);
      console.log(`Name:        ${template.name}`);
      console.log(`Description: ${template.description || '-'}`);
      console.log(`Type:        ${template.template_type}`);
      console.log(`Times Used:  ${template.times_used}`);
      console.log('─'.repeat(60));

      const campaignSettings = typeof template.campaign_settings === 'string'
        ? JSON.parse(template.campaign_settings)
        : template.campaign_settings || {};

      if (Object.keys(campaignSettings).length > 0) {
        console.log('\nCampaign Settings:');
        for (const [key, value] of Object.entries(campaignSettings)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }

      const adgroupSettings = typeof template.adgroup_settings === 'string'
        ? JSON.parse(template.adgroup_settings)
        : template.adgroup_settings || {};

      if (Object.keys(adgroupSettings).length > 0) {
        console.log('\nAd Group Settings:');
        for (const [key, value] of Object.entries(adgroupSettings)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }

      const keywords = typeof template.keywords === 'string'
        ? JSON.parse(template.keywords)
        : template.keywords || [];

      if (keywords.length > 0) {
        console.log(`\nKeywords (${keywords.length}):`);
        for (const kw of keywords.slice(0, 10)) {
          console.log(`  - ${kw.text} (${kw.matchType})${kw.bidAmount ? ` $${kw.bidAmount}` : ''}`);
        }
        if (keywords.length > 10) {
          console.log(`  ... and ${keywords.length - 10} more`);
        }
      }

      const variables = typeof template.variables === 'string'
        ? JSON.parse(template.variables)
        : template.variables || {};

      if (Object.keys(variables).length > 0) {
        console.log('\nVariables:');
        for (const [key, value] of Object.entries(variables)) {
          console.log(`  ${key}: ${value}`);
        }
      }

      console.log('');

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Create template from JSON file
program
  .command('create')
  .description('Create a new template from JSON file')
  .requiredOption('-f, --file <file>', 'JSON file with template definition')
  .action(async (options) => {
    try {
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const templateData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      if (!templateData.name) {
        console.error('Template must have a name');
        process.exit(1);
      }

      const result = await db.query(`
        INSERT INTO asa_campaign_templates (
          name, description, template_type,
          campaign_settings, adgroup_settings, keywords, negative_keywords, variables
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        templateData.name,
        templateData.description || null,
        templateData.template_type || 'campaign',
        JSON.stringify(templateData.campaign_settings || {}),
        JSON.stringify(templateData.adgroup_settings || {}),
        JSON.stringify(templateData.keywords || []),
        JSON.stringify(templateData.negative_keywords || []),
        JSON.stringify(templateData.variables || {})
      ]);

      console.log(`Template created: ID ${result.rows[0].id} - ${result.rows[0].name}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Export template to JSON file
program
  .command('export <templateId>')
  .description('Export template to JSON file')
  .option('-o, --output <file>', 'Output file')
  .action(async (templateId, options) => {
    try {
      const result = await db.query('SELECT * FROM asa_campaign_templates WHERE id = $1', [templateId]);

      if (result.rows.length === 0) {
        console.error('Template not found');
        process.exit(1);
      }

      const template = result.rows[0];

      const exportData = {
        name: template.name,
        description: template.description,
        template_type: template.template_type,
        campaign_settings: typeof template.campaign_settings === 'string'
          ? JSON.parse(template.campaign_settings)
          : template.campaign_settings,
        adgroup_settings: typeof template.adgroup_settings === 'string'
          ? JSON.parse(template.adgroup_settings)
          : template.adgroup_settings,
        keywords: typeof template.keywords === 'string'
          ? JSON.parse(template.keywords)
          : template.keywords,
        negative_keywords: typeof template.negative_keywords === 'string'
          ? JSON.parse(template.negative_keywords)
          : template.negative_keywords,
        variables: typeof template.variables === 'string'
          ? JSON.parse(template.variables)
          : template.variables
      };

      const outputFile = options.output || `template_${templateId}.json`;
      fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
      console.log(`Template exported to ${outputFile}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Delete template
program
  .command('delete <templateId>')
  .description('Delete a template')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (templateId, options) => {
    try {
      const result = await db.query('SELECT name FROM asa_campaign_templates WHERE id = $1', [templateId]);

      if (result.rows.length === 0) {
        console.error('Template not found');
        process.exit(1);
      }

      if (!options.yes) {
        console.log(`Are you sure you want to delete template "${result.rows[0].name}"?`);
        console.log('Use --yes flag to confirm deletion.');
        return;
      }

      await db.query('DELETE FROM asa_campaign_templates WHERE id = $1', [templateId]);
      console.log(`Template deleted: ${result.rows[0].name}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Generate example templates
program
  .command('examples')
  .description('Generate example template JSON files')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action(async (options) => {
    const examples = [
      {
        filename: 'template_brand_campaign.json',
        content: {
          name: 'Brand Campaign Template',
          description: 'Template for brand-focused campaigns with exact match keywords',
          template_type: 'full',
          campaign_settings: {
            dailyBudget: { amount: '100', currency: 'USD' },
            targetCountries: ['US'],
            adGroupCount: 1
          },
          adgroup_settings: {
            defaultBid: 2.50,
            cpaGoal: 30.00
          },
          keywords: [
            { text: '{{app_name}}', matchType: 'EXACT', bidAmount: 3.00 },
            { text: '{{app_name}} app', matchType: 'EXACT', bidAmount: 2.50 },
            { text: '{{app_name}} chat', matchType: 'EXACT', bidAmount: 2.50 }
          ],
          negative_keywords: [
            { text: 'free', matchType: 'BROAD' },
            { text: 'mod', matchType: 'BROAD' }
          ],
          variables: {
            app_name: 'MyApp'
          }
        }
      },
      {
        filename: 'template_competitor_campaign.json',
        content: {
          name: 'Competitor Campaign Template',
          description: 'Template for competitor targeting campaigns',
          template_type: 'full',
          campaign_settings: {
            dailyBudget: { amount: '50', currency: 'USD' },
            targetCountries: ['US', 'GB', 'CA', 'AU']
          },
          adgroup_settings: {
            defaultBid: 1.50,
            cpaGoal: 40.00
          },
          keywords: [
            { text: '{{competitor_1}}', matchType: 'EXACT', bidAmount: 2.00 },
            { text: '{{competitor_2}}', matchType: 'EXACT', bidAmount: 2.00 },
            { text: '{{competitor_1}} alternative', matchType: 'BROAD', bidAmount: 1.50 }
          ],
          variables: {
            competitor_1: 'CompetitorApp',
            competitor_2: 'AnotherCompetitor'
          }
        }
      },
      {
        filename: 'template_discovery_campaign.json',
        content: {
          name: 'Discovery Campaign Template',
          description: 'Template for broad discovery campaigns',
          template_type: 'campaign',
          campaign_settings: {
            dailyBudget: { amount: '30', currency: 'USD' },
            targetCountries: ['US']
          },
          adgroup_settings: {
            defaultBid: 1.00,
            cpaGoal: 50.00
          },
          keywords: [
            { text: 'chat app', matchType: 'BROAD', bidAmount: 1.00 },
            { text: 'messaging', matchType: 'BROAD', bidAmount: 1.00 },
            { text: 'ai assistant', matchType: 'BROAD', bidAmount: 1.00 }
          ],
          variables: {}
        }
      }
    ];

    const outDir = path.resolve(options.output);

    for (const example of examples) {
      const filePath = path.join(outDir, example.filename);
      fs.writeFileSync(filePath, JSON.stringify(example.content, null, 2));
      console.log(`Created: ${filePath}`);
    }

    console.log(`\nGenerated ${examples.length} example template files in ${outDir}`);
    console.log('Use: asa-cli templates create --file=<filename> to create a template');
  });

module.exports = program;
