import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RuleBuilder from '../components/RuleBuilder';
import { getRule, createRule, updateRule } from '../lib/api';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';

export default function RuleEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();

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

      <RuleBuilder
        initialRule={rule}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
