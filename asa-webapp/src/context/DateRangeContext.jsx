import { createContext, useContext, useState, useMemo } from 'react';

const DateRangeContext = createContext();

export const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'Custom', days: null },
];

export function DateRangeProvider({ children }) {
  const [days, setDays] = useState(7);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);

  const queryParams = useMemo(() => {
    const params = {};
    if (isCustom && customFrom && customTo) {
      params.from = customFrom;
      params.to = customTo;
    } else {
      params.days = days;
    }
    if (compareEnabled) {
      params.compare = 'true';
    }
    return params;
  }, [days, customFrom, customTo, isCustom, compareEnabled]);

  const setPreset = (presetDays) => {
    if (presetDays === null) {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      setDays(presetDays);
    }
  };

  const setCustomRange = (from, to) => {
    setCustomFrom(from);
    setCustomTo(to);
    setIsCustom(true);
  };

  const label = isCustom
    ? (customFrom && customTo ? `${customFrom} - ${customTo}` : 'Custom')
    : `Last ${days} days`;

  return (
    <DateRangeContext.Provider value={{
      days,
      customFrom,
      customTo,
      isCustom,
      compareEnabled,
      queryParams,
      label,
      setPreset,
      setCustomRange,
      setCustomFrom,
      setCustomTo,
      setCompareEnabled,
    }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error('useDateRange must be used within DateRangeProvider');
  }
  return context;
}
