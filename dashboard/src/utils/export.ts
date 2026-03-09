/**
 * Export data to CSV
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  // Format cells for CSV (escape quotes, handle nulls)
  const formatCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return '';
    const str = String(cell);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV content
  const csvRows = [
    headers.map(formatCell).join(','),
    ...rows.map(row => row.map(formatCell).join(','))
  ];
  const csv = csvRows.join('\n');

  // Create blob and download
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export button component props
 */
export interface ExportButtonProps {
  onClick: () => void;
  disabled?: boolean;
}
