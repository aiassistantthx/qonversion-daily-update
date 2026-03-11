import axios from 'axios';

const api = axios.create({
  baseURL: '/asa',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Campaigns
export const getCampaigns = (params = {}) => api.get('/campaigns', { params }).then(res => res.data);
export const getCampaign = (id) => api.get(`/campaigns/${id}`).then(res => res.data);
export const createCampaign = (data) => api.post('/campaigns', data).then(res => res.data);
export const createCampaignsBulk = (campaigns) => api.post('/campaigns/bulk', { campaigns }).then(res => res.data);
export const copyCampaign = (id, data) => api.post(`/campaigns/${id}/copy`, data).then(res => res.data);
export const updateCampaignStatus = (id, status) => api.patch(`/campaigns/${id}/status`, { status }).then(res => res.data);
export const updateCampaignBudget = (id, dailyBudget) => api.patch(`/campaigns/${id}/budget`, { dailyBudget }).then(res => res.data);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`).then(res => res.data);

// Ad Groups
export const getAdGroups = (campaignId, params = {}) => api.get(`/campaigns/${campaignId}/adgroups`, { params }).then(res => res.data);
export const updateAdGroupStatus = (campaignId, adGroupId, status) =>
  api.patch(`/campaigns/${campaignId}/adgroups/${adGroupId}/status`, { status }).then(res => res.data);
export const updateAdGroupBid = (campaignId, adGroupId, bidAmount) =>
  api.patch(`/campaigns/${campaignId}/adgroups/${adGroupId}/bid`, { bidAmount }).then(res => res.data);
export const deleteAdGroup = (campaignId, adGroupId) =>
  api.delete(`/campaigns/${campaignId}/adgroups/${adGroupId}`).then(res => res.data);

// Keywords
export const getKeywords = (params) => api.get('/keywords', { params }).then(res => res.data);
export const getKeywordsForAdGroup = (campaignId, adGroupId) =>
  api.get(`/campaigns/${campaignId}/adgroups/${adGroupId}/keywords`).then(res => res.data);
export const updateKeywordBid = (keywordId, data) => api.patch(`/keywords/${keywordId}/bid`, data).then(res => res.data);
export const updateKeywordStatus = (keywordId, data) => api.patch(`/keywords/${keywordId}/status`, data).then(res => res.data);
export const bulkUpdateKeywordBids = (data) => api.patch('/keywords/bulk/bid', data).then(res => res.data);
export const bulkUpdateKeywordStatus = (data) => api.patch('/keywords/bulk/status', data).then(res => res.data);
export const createKeywords = (data) => api.post('/keywords/bulk', data).then(res => res.data);

// Negative Keywords
export const getNegativeKeywords = (params) => api.get('/negative-keywords', { params }).then(res => res.data);
export const createNegativeKeywords = (data) => api.post('/negative-keywords', data).then(res => res.data);
export const deleteNegativeKeyword = (keywordId, data) => api.delete(`/negative-keywords/${keywordId}`, { data }).then(res => res.data);

// Rules
export const getRules = (params) => api.get('/rules', { params }).then(res => res.data);
export const getRule = (id) => api.get(`/rules/${id}`).then(res => res.data);
export const createRule = (data) => api.post('/rules', data).then(res => res.data);
export const updateRule = (id, data) => api.put(`/rules/${id}`, data).then(res => res.data);
export const deleteRule = (id) => api.delete(`/rules/${id}`).then(res => res.data);
export const executeRule = (id, dryRun = false) =>
  api.post(`/rules/${id}/execute?dry_run=${dryRun}`).then(res => res.data);
export const previewRule = (id) => api.get(`/rules/${id}/preview`).then(res => res.data);
export const simulateRule = (id) => api.post(`/rules/${id}/simulate`).then(res => res.data);
export const executeAllRules = (dryRun = false, frequency = null) => {
  const params = { dry_run: dryRun };
  if (frequency) params.frequency = frequency;
  return api.post('/rules/execute-all', null, { params }).then(res => res.data);
};
export const getRuleTemplates = () => api.get('/rule-templates').then(res => res.data);

// Templates
export const getTemplates = (params) => api.get('/templates', { params }).then(res => res.data);
export const getTemplate = (id) => api.get(`/templates/${id}`).then(res => res.data);
export const createTemplate = (data) => api.post('/templates', data).then(res => res.data);
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data).then(res => res.data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`).then(res => res.data);

// History
export const getHistory = (params) => api.get('/history', { params }).then(res => res.data);
export const getEntityHistory = (type, id) => api.get(`/history/entity/${type}/${id}`).then(res => res.data);

// Sync
export const getSyncStatus = () => api.get('/sync/status').then(res => res.data);
export const triggerSync = (days = 7) => api.post(`/sync?days=${days}`).then(res => res.data);
export const triggerIncrementalSync = () => api.post('/sync/incremental').then(res => res.data);
export const syncChanges = () => api.post('/sync/changes').then(res => res.data);

// Trends
export const getTrends = (params = {}) => api.get('/trends', { params }).then(res => res.data);

// Countries
export const getCountries = (params = {}) => api.get('/countries', { params }).then(res => res.data);

// Search Terms
export const getSearchTerms = (params = {}) => api.get('/search-terms', { params }).then(res => res.data);

// KPI
export const getCohortCac = (params = {}) => api.get('/kpi/cohort-cac', { params }).then(res => res.data);

// Alerts
export const getAlerts = (params = {}) => api.get('/alerts', { params }).then(res => res.data);
export const acknowledgeAlert = (id) => api.patch(`/alerts/${id}/acknowledge`).then(res => res.data);
export const getAlertsSummary = () => api.get('/alerts/summary').then(res => res.data);

export default api;
