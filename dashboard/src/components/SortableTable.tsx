import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function useSortableData<T>(data: T[], initialKey: keyof T, initialAsc = false) {
  const [sortKey, setSortKey] = useState<keyof T>(initialKey);
  const [sortAsc, setSortAsc] = useState(initialAsc);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedData = [...data].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    if (aVal == null) aVal = -Infinity as any;
    if (bVal == null) bVal = -Infinity as any;

    if (typeof aVal === 'string') {
      return sortAsc
        ? (aVal as string).localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal as string);
    }

    return sortAsc
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  return { sortedData, sortKey, sortAsc, handleSort };
}

interface SortIconProps {
  column: string;
  currentColumn: string;
  ascending: boolean;
}

export function SortIcon({ column, currentColumn, ascending }: SortIconProps) {
  if (currentColumn !== column) return null;
  return ascending ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
}
