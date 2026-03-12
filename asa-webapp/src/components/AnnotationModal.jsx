import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';

export default function AnnotationModal({ isOpen, onClose, onSave, annotation = null }) {
  const [formData, setFormData] = useState({
    annotation_date: '',
    event_type: 'other',
    title: '',
    description: '',
    color: '#3b82f6',
    marker_style: 'circle'
  });

  const eventTypes = [
    { value: 'campaign_launch', label: 'Campaign Launch' },
    { value: 'bid_change', label: 'Bid Change' },
    { value: 'budget_change', label: 'Budget Change' },
    { value: 'targeting_change', label: 'Targeting Change' },
    { value: 'keyword_added', label: 'Keyword Added' },
    { value: 'keyword_paused', label: 'Keyword Paused' },
    { value: 'rule_execution', label: 'Rule Execution' },
    { value: 'optimization', label: 'Optimization' },
    { value: 'other', label: 'Other' }
  ];

  const eventColors = {
    campaign_launch: '#10b981',
    bid_change: '#3b82f6',
    budget_change: '#f59e0b',
    targeting_change: '#8b5cf6',
    keyword_added: '#06b6d4',
    keyword_paused: '#ef4444',
    rule_execution: '#ec4899',
    optimization: '#84cc16',
    other: '#6b7280'
  };

  useEffect(() => {
    if (annotation) {
      setFormData({
        annotation_date: annotation.annotation_date,
        event_type: annotation.event_type,
        title: annotation.title,
        description: annotation.description || '',
        color: annotation.color || '#3b82f6',
        marker_style: annotation.marker_style || 'circle'
      });
    } else {
      setFormData({
        annotation_date: new Date().toISOString().split('T')[0],
        event_type: 'other',
        title: '',
        description: '',
        color: '#3b82f6',
        marker_style: 'circle'
      });
    }
  }, [annotation, isOpen]);

  const handleEventTypeChange = (e) => {
    const newEventType = e.target.value;
    setFormData({
      ...formData,
      event_type: newEventType,
      color: eventColors[newEventType] || '#3b82f6'
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={annotation ? 'Edit Annotation' : 'Add Annotation'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date
          </label>
          <Input
            type="date"
            value={formData.annotation_date}
            onChange={(e) => setFormData({ ...formData, annotation_date: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Event Type
          </label>
          <select
            value={formData.event_type}
            onChange={handleEventTypeChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            required
          >
            {eventTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Increased budget to $200/day"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description (optional)
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            rows={3}
            placeholder="Additional details about this event..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Color
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="h-10 w-20 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">{formData.color}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">
            {annotation ? 'Update' : 'Create'} Annotation
          </Button>
          <Button type="button" onClick={onClose} className="flex-1 bg-gray-500 hover:bg-gray-600">
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
