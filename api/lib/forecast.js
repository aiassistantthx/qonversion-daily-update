// Forecast library for planning tool
// Handles cohort-based revenue forecasting with decay curves

// Subscription price assumptions
const WEEKLY_PRICE = 9.99;
const YEARLY_PRICE = 99.99;

// Product mix (based on historical data)
const WEEKLY_MIX = 0.94; // 94% weekly subscriptions
const YEARLY_MIX = 0.06; // 6% yearly subscriptions

/**
 * Calculate retention rate from churn rate
 * @param {number} churnRate - Monthly churn rate (%)
 * @returns {number} Monthly retention rate (0-1)
 */
function calculateRetention(churnRate) {
  return 1 - (churnRate / 100);
}

/**
 * Project cohort forward in time with churn
 * @param {number} initialSize - Initial cohort size
 * @param {number} ageInMonths - How many months to project
 * @param {number} weeklyChurn - Weekly subscription monthly churn rate (%)
 * @param {number} yearlyChurn - Yearly subscription monthly churn rate (%)
 * @returns {object} Projected active subscribers by product type
 */
function projectCohort(initialSize, ageInMonths, weeklyChurn, yearlyChurn) {
  const weeklyRetention = calculateRetention(weeklyChurn);
  const yearlyRetention = calculateRetention(yearlyChurn);

  const weeklyActive = initialSize * WEEKLY_MIX * Math.pow(weeklyRetention, ageInMonths);
  const yearlyActive = initialSize * YEARLY_MIX * Math.pow(yearlyRetention, ageInMonths);

  return {
    weekly: weeklyActive,
    yearly: yearlyActive,
    total: weeklyActive + yearlyActive,
  };
}

/**
 * Calculate monthly revenue from active subscribers
 * @param {number} weeklyActive - Active weekly subscribers
 * @param {number} yearlyActive - Active yearly subscribers
 * @returns {number} Monthly revenue
 */
function calculateMonthlyRevenue(weeklyActive, yearlyActive) {
  // Weekly subs pay 4.33 times per month (52 weeks / 12 months)
  const weeklyRevenue = weeklyActive * WEEKLY_PRICE * 4.33;
  // Yearly subs pay 1/12 of annual price per month
  const yearlyRevenue = yearlyActive * (YEARLY_PRICE / 12);

  return weeklyRevenue + yearlyRevenue;
}

/**
 * Calculate cohort age in months from install date
 * @param {string} installDate - ISO date string
 * @param {string} targetDate - ISO date string
 * @returns {number} Age in months
 */
function calculateCohortAge(installDate, targetDate) {
  const install = new Date(installDate);
  const target = new Date(targetDate);

  const months = (target.getFullYear() - install.getFullYear()) * 12 +
                 (target.getMonth() - install.getMonth());

  return Math.max(0, months);
}

/**
 * Generate forecast for a single scenario
 * @param {object} params - Forecast parameters
 * @param {array} params.cohorts - Historical cohorts [{installDate, subscribers, source}]
 * @param {object} params.assumptions - Scenario assumptions
 * @param {number} params.forecastMonths - Number of months to forecast
 * @param {string} params.startDate - Start date for forecast (ISO string)
 * @returns {array} Forecast data points
 */
function generateForecast({ cohorts, assumptions, forecastMonths = 12, startDate }) {
  const {
    cacTarget,
    monthlyChurnRate,
    yearlyChurnRate,
    monthlyBudget,
  } = assumptions;

  const forecast = [];
  const today = new Date(startDate || new Date());

  // Separate cohorts by source
  const appleAdsCohorts = cohorts.filter(c => c.source === 'apple_ads');
  const organicCohorts = cohorts.filter(c => c.source === 'organic');

  // Project forward month by month
  for (let month = 0; month < forecastMonths; month++) {
    const forecastDate = new Date(today);
    forecastDate.setMonth(forecastDate.getMonth() + month + 1);

    // Calculate age of each cohort at this forecast point
    let appleAdsWeekly = 0;
    let appleAdsYearly = 0;
    let organicWeekly = 0;
    let organicYearly = 0;

    // Project existing Apple Ads cohorts
    appleAdsCohorts.forEach(cohort => {
      const cohortAge = calculateCohortAge(cohort.installDate, forecastDate);
      const projected = projectCohort(cohort.subscribers, cohortAge, monthlyChurnRate, yearlyChurnRate);
      appleAdsWeekly += projected.weekly;
      appleAdsYearly += projected.yearly;
    });

    // Project existing organic cohorts
    organicCohorts.forEach(cohort => {
      const cohortAge = calculateCohortAge(cohort.installDate, forecastDate);
      const projected = projectCohort(cohort.subscribers, cohortAge, monthlyChurnRate, yearlyChurnRate);
      organicWeekly += projected.weekly;
      organicYearly += projected.yearly;
    });

    // Add new paid subscribers from monthly budget
    // They start contributing immediately (no churn applied yet)
    const newPaidSubs = monthlyBudget / cacTarget;
    appleAdsWeekly += newPaidSubs * WEEKLY_MIX;
    appleAdsYearly += newPaidSubs * YEARLY_MIX;

    // Calculate revenue
    const appleAdsRevenue = calculateMonthlyRevenue(appleAdsWeekly, appleAdsYearly);
    const organicRevenue = calculateMonthlyRevenue(organicWeekly, organicYearly);

    forecast.push({
      date: forecastDate.toISOString().slice(0, 7),
      appleAdsRevenue,
      organicRevenue,
      totalRevenue: appleAdsRevenue + organicRevenue,
      appleAdsActive: appleAdsWeekly + appleAdsYearly,
      organicActive: organicWeekly + organicYearly,
      totalActive: appleAdsWeekly + appleAdsYearly + organicWeekly + organicYearly,
      spend: monthlyBudget,
      newSubs: newPaidSubs,
      roas: (appleAdsRevenue + organicRevenue) / monthlyBudget,
    });

    // Add these new subs to cohorts for next month
    appleAdsCohorts.push({
      installDate: forecastDate.toISOString().slice(0, 10),
      subscribers: newPaidSubs,
      source: 'apple_ads',
    });
  }

  return forecast;
}

/**
 * Calculate COP breakdown (overall vs paid-only)
 * Average over last 6 months, excluding last 7 days
 * @param {object} db - Database connection
 * @param {string} month - Month in YYYY-MM format (unused, kept for compatibility)
 * @returns {object} COP breakdown
 */
async function calculateCopBreakdown(db, month) {
  // Total spend for last 6 months, excluding last 7 days
  const spendQuery = `
    SELECT COALESCE(SUM(spend), 0) as total_spend
    FROM apple_ads_campaigns
    WHERE date >= CURRENT_DATE - INTERVAL '6 months'
      AND date < CURRENT_DATE - INTERVAL '7 days'
  `;
  const spendResult = await db.query(spendQuery);
  const totalSpend = parseFloat(spendResult.rows[0]?.total_spend) || 0;

  // Total subscribers (paid + organic) for last 6 months, excluding last 7 days
  const totalSubsQuery = `
    SELECT COUNT(DISTINCT q_user_id) as count
    FROM events_v2
    WHERE install_date >= CURRENT_DATE - INTERVAL '6 months'
      AND install_date < CURRENT_DATE - INTERVAL '7 days'
      AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
  `;
  const totalSubsResult = await db.query(totalSubsQuery);
  const totalSubs = parseInt(totalSubsResult.rows[0]?.count) || 0;

  // Paid subscribers only (Apple Ads)
  const paidSubsQuery = `
    SELECT COUNT(DISTINCT q_user_id) as count
    FROM events_v2
    WHERE install_date >= CURRENT_DATE - INTERVAL '6 months'
      AND install_date < CURRENT_DATE - INTERVAL '7 days'
      AND media_source = 'Apple AdServices'
      AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
  `;
  const paidSubsResult = await db.query(paidSubsQuery);
  const paidSubs = parseInt(paidSubsResult.rows[0]?.count) || 0;

  const organicSubs = totalSubs - paidSubs;

  return {
    overall: totalSubs > 0 ? totalSpend / totalSubs : 0,
    paidOnly: paidSubs > 0 ? totalSpend / paidSubs : 0,
    totalCount: totalSubs,
    paidCount: paidSubs,
    organicCount: organicSubs,
  };
}

module.exports = {
  generateForecast,
  calculateCopBreakdown,
  projectCohort,
  calculateMonthlyRevenue,
  calculateCohortAge,
};
