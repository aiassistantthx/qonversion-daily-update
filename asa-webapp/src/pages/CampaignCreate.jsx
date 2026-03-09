import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import CampaignWizard from '../components/CampaignWizard';
import { createCampaign } from '../lib/api';

export default function CampaignCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns']);
      navigate('/campaigns');
    },
  });

  const handleSubmit = (data) => {
    createMutation.mutate(data);
  };

  const handleCancel = () => {
    navigate('/campaigns');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New Campaign</h1>
        <p className="text-gray-500">Set up a new Apple Search Ads campaign</p>
      </div>

      {createMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            Error creating campaign: {createMutation.error.message}
          </p>
        </div>
      )}

      <CampaignWizard
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}
