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

  const queryParams = useMemo(() => {
    if (isCustom && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return { days };
  }, [days, customFrom, customTo, isCustom]);

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
      queryParams,
      label,
      setPreset,
      setCustomRange,
      setCustomFrom,
      setCustomTo,
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
