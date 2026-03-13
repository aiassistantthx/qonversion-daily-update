import React, { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { useIsMobile } from '../hooks/useIsMobile';
import { BottomSheet } from './BottomSheet';
import ScheduledExportModal from './ScheduledExportModal';

const ExportButton = ({
  data,
  columns,
  visibleColumns,
  filename = 'export',
  pageKey,
  currentFilters,
  onScheduleExport
}) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(visibleColumns || columns.map(c => c.key));
  const [exportFormat, setExportFormat] = useState('csv');
  const isMobile = useIsMobile();

  const handleColumnToggle = (columnKey) => {
    setSelectedColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
  };

  const handleSelectAll = () => {
    setSelectedColumns(columns.map(c => c.key));
  };

  const handleSelectNone = () => {
    setSelectedColumns([]);
  };

  const exportCSV = () => {
    const exportCols = columns.filter(c => selectedColumns.includes(c.key));
    const headers = exportCols.map(c => c.label);
    const rows = data.map(item =>
      exportCols.map(col => {
        const value = col.getValue ? col.getValue(item) : item[col.key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
        return value;
      })
    );

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportCols = columns.filter(c => selectedColumns.includes(c.key));

      const wsData = [
        exportCols.map(c => c.label),
        ...data.map(item =>
          exportCols.map(col => {
            const value = col.getValue ? col.getValue(item) : item[col.key];
            return value ?? '';
          })
        )
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`);
      setShowExportModal(false);
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('Excel export requires the xlsx library. Falling back to CSV.');
      exportCSV();
    }
  };

  const exportGoogleSheets = () => {
    const exportCols = columns.filter(c => selectedColumns.includes(c.key));
    const headers = exportCols.map(c => c.label).join('\t');
    const rows = data.map(item =>
      exportCols.map(col => {
        const value = col.getValue ? col.getValue(item) : item[col.key];
        return value ?? '';
      }).join('\t')
    ).join('\n');

    const tsv = headers + '\n' + rows;
    navigator.clipboard.writeText(tsv).then(() => {
      alert('Data copied to clipboard! Paste it into Google Sheets.');
      setShowExportModal(false);
    }).catch(() => {
      alert('Failed to copy to clipboard. Please try CSV export instead.');
    });
  };

  const handleExport = () => {
    if (selectedColumns.length === 0) {
      alert('Please select at least one column to export');
      return;
    }

    switch (exportFormat) {
      case 'csv':
        exportCSV();
        break;
      case 'excel':
        exportExcel();
        break;
      case 'sheets':
        exportGoogleSheets();
        break;
      default:
        exportCSV();
    }
  };

  const ExportContent = () => (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium mb-2">Export Format</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="csv"
              checked={exportFormat === 'csv'}
              onChange={(e) => setExportFormat(e.target.value)}
              className="w-4 h-4"
            />
            <span>CSV (.csv)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="excel"
              checked={exportFormat === 'excel'}
              onChange={(e) => setExportFormat(e.target.value)}
              className="w-4 h-4"
            />
            <span>Excel (.xlsx)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="sheets"
              checked={exportFormat === 'sheets'}
              onChange={(e) => setExportFormat(e.target.value)}
              className="w-4 h-4"
            />
            <span>Google Sheets (copy to clipboard)</span>
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Select Columns</h3>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              All
            </button>
            <button
              onClick={handleSelectNone}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto border dark:border-gray-700 rounded p-2 space-y-1">
          {columns.map(col => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded">
              <input
                type="checkbox"
                checked={selectedColumns.includes(col.key)}
                onChange={() => handleColumnToggle(col.key)}
                className="w-4 h-4"
              />
              <span className="text-sm">{col.label}</span>
            </label>
          ))}
        </div>
      </div>

      {pageKey && (
        <div>
          <button
            onClick={() => {
              setShowExportModal(false);
              setShowScheduleModal(true);
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Schedule this export (daily/weekly email)
          </button>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          variant="secondary"
          onClick={() => setShowExportModal(false)}
        >
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          disabled={selectedColumns.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Export ({data.length} rows)
        </Button>
      </div>
    </div>
  );

  const handleSaveSchedule = (scheduleConfig) => {
    if (onScheduleExport) {
      onScheduleExport({
        ...scheduleConfig,
        columns: selectedColumns,
        format: exportFormat,
        filters: currentFilters
      });
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setShowExportModal(true)}
      >
        <Download className="w-4 h-4 mr-2" />
        Export
        <ChevronDown className="w-4 h-4 ml-1" />
      </Button>

      {isMobile ? (
        <BottomSheet
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Export Data"
        >
          <ExportContent />
        </BottomSheet>
      ) : (
        <Modal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Export Data"
        >
          <ExportContent />
        </Modal>
      )}

      <ScheduledExportModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        config={{ columns: selectedColumns, format: exportFormat }}
        onSave={handleSaveSchedule}
      />
    </>
  );
};

export default ExportButton;
