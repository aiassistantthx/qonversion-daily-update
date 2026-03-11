import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

function ScoreGauge({ score }) {
  const radius = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const getColor = (score) => {
    if (score >= 80) return '#22c55e'; // green
    if (score >= 60) return '#eab308'; // yellow
    if (score >= 40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="transform -rotate-90" width="140" height="140">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color: getColor(score) }}>
          {score}
        </span>
        <span className="text-xs text-gray-500">Health Score</span>
      </div>
    </div>
  );
}

function ScoreItem({ label, score, status, detail }) {
  const statusConfig = {
    good: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  };

  const config = statusConfig[status] || statusConfig.good;
  const Icon = config.icon;

  return (
    <div className={`flex items-center justify-between p-2 rounded-lg ${config.bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">{detail}</span>
        <span className={`text-sm font-bold ${config.color}`}>{score}/100</span>
      </div>
    </div>
  );
}

export function HealthScoreWidget({ campaigns = [] }) {
  const [expanded, setExpanded] = useState(false);

  // Calculate health metrics
  const calculateHealthScore = () => {
    if (campaigns.length === 0) return { total: 0, metrics: [] };

    const getPerf = (c, field) => {
      const p = c.performance;
      if (!p) return 0;
      return parseFloat(p[field] || 0);
    };

    // 1. ROAS Score (0-100)
    // Good: ROAS >= 1.2, Warning: 0.8-1.2, Critical: < 0.8
    const totalSpend = campaigns.reduce((sum, c) => sum + getPerf(c, 'spend'), 0);
    const totalRevenue = campaigns.reduce((sum, c) => sum + getPerf(c, 'revenue'), 0);
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    let roasScore = 0;
    let roasStatus = 'critical';
    let roasDetail = `${(roas * 100).toFixed(0)}%`;
    if (roas >= 1.2) {
      roasScore = 100;
      roasStatus = 'good';
    } else if (roas >= 1.0) {
      roasScore = 80;
      roasStatus = 'good';
    } else if (roas >= 0.8) {
      roasScore = 60;
      roasStatus = 'warning';
    } else if (roas >= 0.5) {
      roasScore = 40;
      roasStatus = 'warning';
    } else {
      roasScore = Math.max(20, Math.round(roas * 40));
      roasStatus = 'critical';
    }

    // 2. CPA Score (0-100)
    // Based on target CPA of $5 (adjust based on your business)
    const totalInstalls = campaigns.reduce((sum, c) => sum + getPerf(c, 'installs'), 0);
    const cpa = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
    const targetCpa = 5.0;

    let cpaScore = 0;
    let cpaStatus = 'critical';
    let cpaDetail = cpa > 0 ? `$${cpa.toFixed(2)}` : 'N/A';
    if (cpa === 0) {
      cpaScore = 50;
      cpaStatus = 'warning';
      cpaDetail = 'No installs';
    } else if (cpa <= targetCpa * 0.8) {
      cpaScore = 100;
      cpaStatus = 'good';
    } else if (cpa <= targetCpa) {
      cpaScore = 85;
      cpaStatus = 'good';
    } else if (cpa <= targetCpa * 1.3) {
      cpaScore = 65;
      cpaStatus = 'warning';
    } else if (cpa <= targetCpa * 1.5) {
      cpaScore = 45;
      cpaStatus = 'warning';
    } else {
      cpaScore = Math.max(20, Math.round(100 - (cpa - targetCpa) * 10));
      cpaStatus = 'critical';
    }

    // 3. Campaign Status Score (0-100)
    // Penalize if many campaigns are paused
    const enabledCampaigns = campaigns.filter(c => c.status === 'ENABLED').length;
    const statusRatio = campaigns.length > 0 ? enabledCampaigns / campaigns.length : 0;

    let statusScore = Math.round(statusRatio * 100);
    let statusStatus = statusRatio >= 0.7 ? 'good' : statusRatio >= 0.4 ? 'warning' : 'critical';
    let statusDetail = `${enabledCampaigns}/${campaigns.length} active`;

    // 4. Spend Pacing Score (0-100)
    // Check if spend is within expected range
    const campaignsWithBudget = campaigns.filter(c => c.dailyBudgetAmount?.amount > 0);
    let pacingScore = 100;
    let pacingStatus = 'good';
    let underSpend = 0;
    let overSpend = 0;

    campaignsWithBudget.forEach(c => {
      const budget = parseFloat(c.dailyBudgetAmount?.amount || 0);
      const spend = getPerf(c, 'spend');
      // This is aggregate spend, so we compare to budget * days
      // For simplicity, just check if any campaign has very low spend
      if (spend < budget * 0.5 && c.status === 'ENABLED') underSpend++;
      if (spend > budget * 1.1) overSpend++;
    });

    if (campaignsWithBudget.length > 0) {
      const issueRatio = (underSpend + overSpend) / campaignsWithBudget.length;
      pacingScore = Math.round((1 - issueRatio) * 100);
      if (pacingScore >= 80) {
        pacingStatus = 'good';
      } else if (pacingScore >= 50) {
        pacingStatus = 'warning';
      } else {
        pacingStatus = 'critical';
      }
    }
    let pacingDetail = underSpend > 0 || overSpend > 0
      ? `${underSpend} under, ${overSpend} over`
      : 'On track';

    // Calculate total weighted score
    const weights = { roas: 0.35, cpa: 0.25, status: 0.2, pacing: 0.2 };
    const totalScore = Math.round(
      roasScore * weights.roas +
      cpaScore * weights.cpa +
      statusScore * weights.status +
      pacingScore * weights.pacing
    );

    return {
      total: totalScore,
      metrics: [
        { label: 'ROAS', score: roasScore, status: roasStatus, detail: roasDetail },
        { label: 'CPA', score: cpaScore, status: cpaStatus, detail: cpaDetail },
        { label: 'Active Campaigns', score: statusScore, status: statusStatus, detail: statusDetail },
        { label: 'Spend Pacing', score: pacingScore, status: pacingStatus, detail: pacingDetail },
      ],
    };
  };

  const health = calculateHealthScore();
  const criticalMetrics = health.metrics.filter(m => m.status === 'critical');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Health Score</span>
          {criticalMetrics.length > 0 && (
            <span className="flex items-center gap-1 text-sm font-normal text-red-600">
              <AlertCircle className="w-4 h-4" />
              {criticalMetrics.length} issue{criticalMetrics.length > 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <ScoreGauge score={health.total} />

          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            {expanded ? 'Hide' : 'Show'} details
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {expanded && (
            <div className="w-full mt-4 space-y-2">
              {health.metrics.map((metric) => (
                <ScoreItem
                  key={metric.label}
                  label={metric.label}
                  score={metric.score}
                  status={metric.status}
                  detail={metric.detail}
                />
              ))}
            </div>
          )}

          {/* Critical alerts always visible */}
          {!expanded && criticalMetrics.length > 0 && (
            <div className="w-full mt-4 space-y-2">
              {criticalMetrics.map((metric) => (
                <ScoreItem
                  key={metric.label}
                  label={metric.label}
                  score={metric.score}
                  status={metric.status}
                  detail={metric.detail}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
