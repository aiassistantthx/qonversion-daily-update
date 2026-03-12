import React, { useState } from 'react';
import Modal from './Modal';
import BottomSheet from './BottomSheet';
import Button from './Button';
import Input from './Input';
import { useIsMobile } from '../hooks/useIsMobile';
import { Calendar, Mail, Clock } from 'lucide-react';

const ScheduledExportModal = ({ isOpen, onClose, config, onSave }) => {
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({
    name: config?.name || '',
    email: config?.email || '',
    frequency: config?.frequency || 'daily',
    time: config?.time || '09:00',
    enabled: config?.enabled !== false,
    columns: config?.columns || [],
    format: config?.format || 'csv'
  });

  const handleSave = () => {
    if (!formData.name || !formData.email) {
      alert('Please fill in all required fields');
      return;
    }

    onSave({
      ...formData,
      id: config?.id || Date.now().toString()
    });
    onClose();
  };

  const Content = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Export Name <span className="text-red-500">*</span>
        </label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Daily Campaign Report"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Email Address <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="your@email.com"
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            <Calendar className="inline w-4 h-4 mr-1" />
            Frequency
          </label>
          <select
            value={formData.frequency}
            onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Monday)</option>
            <option value="monthly">Monthly (1st)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            <Clock className="inline w-4 h-4 mr-1" />
            Time
          </label>
          <Input
            type="time"
            value={formData.time}
            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Format</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="csv"
              checked={formData.format === 'csv'}
              onChange={(e) => setFormData({ ...formData, format: e.target.value })}
              className="w-4 h-4"
            />
            <span>CSV</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="excel"
              checked={formData.format === 'excel'}
              onChange={(e) => setFormData({ ...formData, format: e.target.value })}
              className="w-4 h-4"
            />
            <span>Excel</span>
          </label>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Note:</strong> The export will include {formData.columns.length} selected columns and use your current filter settings at the time of execution.
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-sm">Enable this scheduled export</span>
      </label>

      <div className="flex gap-2 justify-end pt-4 border-t dark:border-gray-700">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Schedule
        </Button>
      </div>
    </div>
  );

  return isMobile ? (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Schedule Export">
      <Content />
    </BottomSheet>
  ) : (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Export">
      <Content />
    </Modal>
  );
};

export default ScheduledExportModal;
