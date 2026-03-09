import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import RuleBuilder from '../components/RuleBuilder';
import { getRule, createRule, updateRule, simulateRule } from '../lib/api';
import { ArrowLeft, Play } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

export default function RuleEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationData, setSimulationData] = useState(null);

  const { data: ruleData, isLoading } = useQuery({
    queryKey: ['rule', id],
    queryFn: () => getRule(id),
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      queryClient.invalidateQueries(['rules']);
      navigate('/rules');
    },
    onError: (error) => {
      alert('Failed to create rule: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['rules']);
      queryClient.invalidateQueries(['rule', id]);
      navigate('/rules');
    },
    onError: (error) => {
      alert('Failed to update rule: ' + error.message);
    },
  });

  const handleSave = (ruleData) => {
    if (id) {
      updateMutation.mutate({ id, data: ruleData });
    } else {
      createMutation.mutate(ruleData);
    }
  };

  const handleCancel = () => {
    navigate('/rules');
  };

  const simulateMutation = useMutation({
    mutationFn: () => simulateRule(id),
    onSuccess: (data) => {
      setSimulationData(data);
      setSimulationOpen(true);
    },
    onError: (error) => {
      alert('Failed to simulate rule: ' + error.message);
    },
  });

  const handleSimulate = () => {
    if (!id) {
      alert('Please save the rule first before simulating');
      return;
    }
    simulateMutation.mutate();
  };

  if (id && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading rule...</div>
      </div>
    );
  }

  const rule = id && ruleData?.data ? ruleData.data : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/rules')}
            className="flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Rules
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {id ? 'Edit Rule' : 'Create New Rule'}
            </h1>
            <p className="text-gray-500">
              {id ? 'Modify an existing automation rule' : 'Build a new automation rule with the visual editor'}
            </p>
          </div>
        </div>
        {id && (
          <Button
            variant="secondary"
            onClick={handleSimulate}
            disabled={simulateMutation.isPending}
            className="flex items-center gap-2"
          >
            <Play size={16} />
            {simulateMutation.isPending ? 'Simulating...' : 'Simulate Rule'}
          </Button>
        )}
      </div>

      <RuleBuilder
        initialRule={rule}
        onSave={handleSave}
        onCancel={handleCancel}
      />

      {simulationOpen && simulationData && (
        <Modal
          open={simulationOpen}
          onClose={() => setSimulationOpen(false)}
          title="Rule Simulation Results"
          size="large"
        >
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {simulationData.summary.totalEntities}
                  </div>
                  <div className="text-xs text-gray-600">Total Entities</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {simulationData.summary.affected}
                  </div>
                  <div className="text-xs text-gray-600">Will Be Affected</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-400">
                    {simulationData.summary.skipped}
                  </div>
                  <div className="text-xs text-gray-600">Skipped</div>
                </div>
              </div>
            </div>

            {/* Affected Entities */}
            {simulationData.affectedEntities.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Affected {simulationData.scope}s
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {simulationData.scope}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Current Value
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          New Value
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Change
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {simulationData.affectedEntities.map((entity) => {
                        const oldVal = typeof entity.action.oldValue === 'number'
                          ? entity.action.oldValue.toFixed(2)
                          : entity.action.oldValue;
                        const newVal = typeof entity.action.newValue === 'number'
                          ? entity.action.newValue.toFixed(2)
                          : entity.action.newValue;
                        const change = typeof entity.action.oldValue === 'number' && typeof entity.action.newValue === 'number'
                          ? ((entity.action.newValue - entity.action.oldValue) / entity.action.oldValue * 100).toFixed(1)
                          : null;

                        return (
                          <tr key={entity.entityId}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {entity.entityName}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {oldVal}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {newVal}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {change !== null && (
                                <span className={change > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {change > 0 ? '+' : ''}{change}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Skipped Entities */}
            {simulationData.skippedEntities.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Skipped {simulationData.scope}s
                </h3>
                <div className="space-y-2">
                  {simulationData.skippedEntities.slice(0, 5).map((entity) => (
                    <div key={entity.entityId} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      <span className="font-medium">{entity.entityId}</span>: {entity.reason}
                    </div>
                  ))}
                  {simulationData.skippedEntities.length > 5 && (
                    <div className="text-sm text-gray-500">
                      ... and {simulationData.skippedEntities.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setSimulationOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
