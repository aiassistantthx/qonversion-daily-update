/**
 * Shared utilities for ASA routes
 */

const db = require('../../db');
const cache = require('../../lib/cache');

// Apple takes ~26% commission, developer gets 74% (proceeds)
const PROCEEDS_RATE = 0.74;

/**
 * Record change to history
 */
async function recordChange(entityType, entityId, changeType, fieldName, oldValue, newValue, source, ruleId = null, req = null) {
  try {
    await db.query(`
      INSERT INTO asa_change_history (
        entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
        change_type, field_name, old_value, new_value, source, rule_id,
        user_id, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      entityType,
      entityId,
      entityType === 'campaign' ? entityId : null,
      entityType === 'adgroup' ? entityId : null,
      entityType === 'keyword' ? entityId : null,
      changeType,
      fieldName,
      oldValue,
      newValue,
      source,
      ruleId,
      req?.user?.id || null,
      req?.ip || null,
      req?.get('user-agent') || null
    ]);
  } catch (error) {
    console.error('Failed to record change:', error.message);
  }
}

/**
 * Invalidate cache on data changes
 */
function invalidateCache(entityType, entityId) {
  switch (entityType) {
    case 'campaign':
      cache.invalidate('campaigns:*');
      cache.invalidate(`campaign:${entityId}:*`);
      break;
    case 'adgroup':
      cache.invalidate('adgroups:*');
      cache.invalidate(`adgroup:${entityId}:*`);
      break;
    case 'keyword':
      cache.invalidate('keywords:*');
      cache.invalidate(`keyword:${entityId}:*`);
      break;
  }
}

/**
 * Parse date filter from query params
 * @param {Object} query - req.query object
 * @returns {Object} - { dateFilter, dateCondition, revenueCondition }
 *
 * Supports:
 * - days=30 — last 30 days
 * - from=2026-01-01&to=2026-01-31 — specific range
 * - cohort_offset=7 — exclude last N days (for closed cohort analysis)
 */
function parseDateFilter(query) {
  let { days = 7, from, to, cohort_offset } = query;
  let dateFilter;

  // Parse cohort_offset to exclude last N days
  const offset = cohort_offset ? parseInt(cohort_offset) : 0;

  if (from && to) {
    dateFilter = { from, to };
  } else {
    days = parseInt(days) || 7;
    dateFilter = { days, cohort_offset: offset };
  }

  let dateCondition, revenueCondition;

  if (dateFilter.days) {
    if (offset > 0) {
      // Exclude last N days for closed cohort analysis
      dateCondition = `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days' AND date < CURRENT_DATE - INTERVAL '${offset} days'`;
      revenueCondition = `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days' AND install_date < CURRENT_DATE - INTERVAL '${offset} days'`;
    } else {
      dateCondition = `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`;
      revenueCondition = `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`;
    }
  } else {
    dateCondition = `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;
    revenueCondition = `install_date >= '${dateFilter.from}' AND install_date <= '${dateFilter.to}'`;
  }

  return { dateFilter, dateCondition, revenueCondition };
}

/**
 * Build previous period date conditions for comparison
 * @param {Object} query - req.query object
 * @param {Object} dateFilter - current date filter
 * @returns {Object} - { prevDateFilter, prevDateCondition, prevRevenueCondition }
 */
function buildPrevPeriodConditions(query, dateFilter) {
  const { compare, from, to } = query;

  if (compare !== 'true') {
    return { prevDateFilter: null, prevDateCondition: null, prevRevenueCondition: null };
  }

  let prevDateFilter;
  if (from && to) {
    const currentFrom = new Date(from);
    const currentTo = new Date(to);
    const diffDays = Math.ceil((currentTo - currentFrom) / (1000 * 60 * 60 * 24));
    const prevTo = new Date(currentFrom);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - diffDays);
    prevDateFilter = {
      from: prevFrom.toISOString().split('T')[0],
      to: prevTo.toISOString().split('T')[0]
    };
  } else {
    prevDateFilter = { days: dateFilter.days, offset: dateFilter.days };
  }

  let prevDateCondition, prevRevenueCondition;
  if (prevDateFilter.days) {
    prevDateCondition = `date >= CURRENT_DATE - INTERVAL '${prevDateFilter.days * 2} days' AND date < CURRENT_DATE - INTERVAL '${prevDateFilter.days} days'`;
    prevRevenueCondition = `install_date >= CURRENT_DATE - INTERVAL '${prevDateFilter.days * 2} days' AND install_date < CURRENT_DATE - INTERVAL '${prevDateFilter.days} days'`;
  } else {
    prevDateCondition = `date >= '${prevDateFilter.from}' AND date <= '${prevDateFilter.to}'`;
    prevRevenueCondition = `install_date >= '${prevDateFilter.from}' AND install_date <= '${prevDateFilter.to}'`;
  }

  return { prevDateFilter, prevDateCondition, prevRevenueCondition };
}

module.exports = {
  PROCEEDS_RATE,
  recordChange,
  invalidateCache,
  parseDateFilter,
  buildPrevPeriodConditions,
  db,
  cache
};
