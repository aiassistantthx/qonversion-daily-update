import { useState, useEffect } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function BidScheduler({ schedule, onChange }) {
  const [grid, setGrid] = useState(() => {
    if (schedule && typeof schedule === 'object') {
      return schedule;
    }
    const defaultGrid = {};
    DAYS.forEach((_, dayIndex) => {
      defaultGrid[dayIndex] = {};
      HOURS.forEach(hour => {
        defaultGrid[dayIndex][hour] = 1.0;
      });
    });
    return defaultGrid;
  });

  const [selectedCells, setSelectedCells] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [multiplierInput, setMultiplierInput] = useState('1.0');

  useEffect(() => {
    onChange?.(grid);
  }, [grid]);

  const handleCellMouseDown = (day, hour) => {
    setIsDragging(true);
    const cellKey = `${day}-${hour}`;
    setSelectedCells([cellKey]);
  };

  const handleCellMouseEnter = (day, hour) => {
    if (isDragging) {
      const cellKey = `${day}-${hour}`;
      if (!selectedCells.includes(cellKey)) {
        setSelectedCells([...selectedCells, cellKey]);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const applyMultiplier = () => {
    const value = parseFloat(multiplierInput);
    if (isNaN(value) || value < 0 || value > 2) {
      alert('Please enter a value between 0 and 2.0');
      return;
    }

    const newGrid = { ...grid };
    selectedCells.forEach(cellKey => {
      const [day, hour] = cellKey.split('-').map(Number);
      if (!newGrid[day]) newGrid[day] = {};
      newGrid[day][hour] = value;
    });

    setGrid(newGrid);
    setSelectedCells([]);
  };

  const resetSelection = () => {
    setSelectedCells([]);
  };

  const fillAll = (value) => {
    const newGrid = {};
    DAYS.forEach((_, dayIndex) => {
      newGrid[dayIndex] = {};
      HOURS.forEach(hour => {
        newGrid[dayIndex][hour] = value;
      });
    });
    setGrid(newGrid);
  };

  const getCellColor = (multiplier) => {
    if (multiplier === 0) return 'bg-gray-300';
    if (multiplier < 0.7) return 'bg-red-200';
    if (multiplier < 1.0) return 'bg-orange-200';
    if (multiplier === 1.0) return 'bg-white';
    if (multiplier < 1.5) return 'bg-green-200';
    return 'bg-green-400';
  };

  const isCellSelected = (day, hour) => {
    return selectedCells.includes(`${day}-${hour}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Bid Schedule (Dayparting)</h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fillAll(1.0)}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
          >
            Reset All
          </button>
          <button
            type="button"
            onClick={() => fillAll(0)}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
          >
            Disable All
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Select cells by clicking and dragging, then set a bid multiplier (0 = paused, 1.0 = normal, 2.0 = max)
      </div>

      {selectedCells.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-gray-700">{selectedCells.length} cells selected</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={multiplierInput}
            onChange={(e) => setMultiplierInput(e.target.value)}
            className="w-20 px-2 py-1 text-sm border rounded"
          />
          <button
            type="button"
            onClick={applyMultiplier}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={resetSelection}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border bg-gray-50 p-2 text-xs font-medium text-gray-600 sticky left-0 z-10">
                  Day / Hour
                </th>
                {HOURS.map(hour => (
                  <th key={hour} className="border bg-gray-50 p-1 text-xs font-medium text-gray-600 min-w-[32px]">
                    {hour}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, dayIndex) => (
                <tr key={dayIndex}>
                  <td className="border bg-gray-50 p-2 text-xs font-medium text-gray-600 sticky left-0 z-10">
                    {day}
                  </td>
                  {HOURS.map(hour => {
                    const multiplier = grid[dayIndex]?.[hour] ?? 1.0;
                    const isSelected = isCellSelected(dayIndex, hour);
                    return (
                      <td
                        key={hour}
                        className={`border p-1 cursor-pointer select-none transition-colors ${
                          isSelected ? 'ring-2 ring-blue-500 ring-inset' : ''
                        } ${getCellColor(multiplier)}`}
                        onMouseDown={() => handleCellMouseDown(dayIndex, hour)}
                        onMouseEnter={() => handleCellMouseEnter(dayIndex, hour)}
                        title={`${day} ${hour}:00 - Multiplier: ${multiplier.toFixed(1)}x`}
                      >
                        <div className="text-[10px] text-center leading-none text-gray-700">
                          {multiplier === 0 ? '—' : multiplier.toFixed(1)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="font-medium text-gray-600">Legend:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-gray-300 border rounded"></div>
          <span className="text-gray-600">Paused (0)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-200 border rounded"></div>
          <span className="text-gray-600">Low (&lt;0.7)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-orange-200 border rounded"></div>
          <span className="text-gray-600">Reduced (&lt;1.0)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-white border rounded"></div>
          <span className="text-gray-600">Normal (1.0)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-200 border rounded"></div>
          <span className="text-gray-600">High (&lt;1.5)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-400 border rounded"></div>
          <span className="text-gray-600">Max (≥1.5)</span>
        </div>
      </div>
    </div>
  );
}
