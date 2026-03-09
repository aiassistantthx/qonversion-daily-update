import { useState } from 'react';
import { Button } from '../Button';
import BasicInfoStep from './BasicInfoStep';
import TargetingStep from './TargetingStep';
import BudgetStep from './BudgetStep';
import ReviewStep from './ReviewStep';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 'basic', title: 'Basic Info', component: BasicInfoStep },
  { id: 'targeting', title: 'Targeting', component: TargetingStep },
  { id: 'budget', title: 'Budget', component: BudgetStep },
  { id: 'review', title: 'Review', component: ReviewStep },
];

export default function CampaignWizard({ onSubmit, onCancel, isSubmitting, initialData }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState(() => {
    if (initialData) {
      return {
        name: `${initialData.name} (Copy)`,
        adamId: initialData.adamId || '',
        countriesOrRegions: initialData.countriesOrRegions || [],
        supplySources: initialData.supplySources || ['APPSTORE_SEARCH_RESULTS'],
        adGroupName: initialData.adGroups?.[0]?.name ? `${initialData.adGroups[0].name} (Copy)` : '',
        defaultBid: initialData.adGroups?.[0]?.defaultBidAmount?.amount || '1.00',
        keywords: [],
        negativeKeywords: [],
        dailyBudget: initialData.dailyBudgetAmount?.amount || '',
        totalBudget: initialData.budgetAmount?.amount || '',
        startDate: '',
        endDate: '',
        status: 'PAUSED',
      };
    }
    return {
      name: '',
      adamId: '',
      countriesOrRegions: [],
      supplySources: ['APPSTORE_SEARCH_RESULTS'],
      adGroupName: '',
      defaultBid: '1.00',
      keywords: [],
      negativeKeywords: [],
      dailyBudget: '',
      totalBudget: '',
      startDate: '',
      endDate: '',
      status: 'PAUSED',
    };
  });
  const [errors, setErrors] = useState({});

  const updateData = (updates) => {
    setData(prev => ({ ...prev, ...updates }));
    setErrors(prev => {
      const newErrors = { ...prev };
      Object.keys(updates).forEach(key => delete newErrors[key]);
      return newErrors;
    });
  };

  const validateStep = (stepIndex) => {
    const newErrors = {};
    const step = STEPS[stepIndex];

    if (step.id === 'basic') {
      if (!data.name?.trim()) newErrors.name = 'Campaign name is required';
      if (!data.adamId?.trim()) newErrors.adamId = 'App ID is required';
      if (!data.countriesOrRegions?.length) newErrors.countriesOrRegions = 'Select at least one country';
    } else if (step.id === 'targeting') {
      if (!data.adGroupName?.trim()) newErrors.adGroupName = 'Ad group name is required';
    } else if (step.id === 'budget') {
      if (!data.dailyBudget || parseFloat(data.dailyBudget) < 1) {
        newErrors.dailyBudget = 'Daily budget must be at least $1';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleStepClick = (index) => {
    if (index < currentStep || index === 0) {
      setCurrentStep(index);
    }
  };

  const handleSubmit = () => {
    if (validateStep(currentStep)) {
      onSubmit(data);
    }
  };

  const CurrentStepComponent = STEPS[currentStep].component;
  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => handleStepClick(index)}
                disabled={index > currentStep}
                className={`flex items-center gap-2 ${index <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    index < currentStep
                      ? 'bg-green-500 text-white'
                      : index === currentStep
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {index < currentStep ? <Check size={20} /> : index + 1}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:inline ${
                    index <= currentStep ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {step.title}
                </span>
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-4 ${
                    index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          {STEPS[currentStep].title}
        </h2>
        <CurrentStepComponent data={data} onChange={updateData} errors={errors} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {!isFirstStep && (
            <Button variant="secondary" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <div>
          {isLastStep ? (
            <Button onClick={handleSubmit} loading={isSubmitting}>
              Create Campaign
            </Button>
          ) : (
            <Button onClick={handleNext}>Next</Button>
          )}
        </div>
      </div>
    </div>
  );
}
