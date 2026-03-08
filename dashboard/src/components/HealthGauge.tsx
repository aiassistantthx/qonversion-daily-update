interface HealthGaugeProps {
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
}

export function HealthGauge({ score, status }: HealthGaugeProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'excellent': return 'text-terminal-green';
      case 'good': return 'text-terminal-cyan';
      case 'warning': return 'text-terminal-yellow';
      case 'critical': return 'text-terminal-red';
    }
  };

  const getStatusBg = () => {
    switch (status) {
      case 'excellent': return 'bg-terminal-green';
      case 'good': return 'bg-terminal-cyan';
      case 'warning': return 'bg-terminal-yellow';
      case 'critical': return 'bg-terminal-red';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'excellent': return 'Excellent';
      case 'good': return 'Good';
      case 'warning': return 'Warning';
      case 'critical': return 'Critical';
    }
  };

  // Calculate bar segments
  const segments = 10;
  const filledSegments = Math.round((score / 100) * segments);

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <div className="text-sm text-terminal-muted mb-3">Health Score</div>

      <div className="flex items-center gap-4">
        <div className={`text-4xl font-bold font-mono ${getStatusColor()}`}>
          {score}
        </div>
        <div className="text-terminal-muted text-2xl">/100</div>
      </div>

      <div className="flex gap-1 mt-3 mb-2">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-sm ${
              i < filledSegments ? getStatusBg() : 'bg-terminal-border'
            }`}
            style={{ opacity: i < filledSegments ? 1 - (i * 0.05) : 0.3 }}
          />
        ))}
      </div>

      <div className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusLabel()}
      </div>
    </div>
  );
}
