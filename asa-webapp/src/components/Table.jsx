import { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

export function Table({ children, className = '', stickyFirstColumn = false, showScrollHint = true }) {
  const [showHint, setShowHint] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !showScrollHint) return;

    const checkScroll = () => {
      const hasHorizontalScroll = container.scrollWidth > container.clientWidth;
      const isAtStart = container.scrollLeft === 0;
      setShowHint(hasHorizontalScroll && isAtStart);
    };

    checkScroll();
    window.addEventListener('resize', checkScroll);

    const handleScroll = () => {
      if (container.scrollLeft > 20) {
        setShowHint(false);
      }
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('resize', checkScroll);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [showScrollHint]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`overflow-x-auto ${className}`}>
        <table className={`min-w-full divide-y divide-gray-200 ${stickyFirstColumn ? 'mobile-sticky-table' : ''}`}>
          {children}
        </table>
      </div>

      {showHint && (
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none flex items-center justify-end pr-2 md:hidden">
          <div className="bg-blue-500 text-white rounded-full p-1 animate-pulse">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TableHead({ children }) {
  return (
    <thead className="bg-gray-50">
      {children}
    </thead>
  );
}

export function TableBody({ children }) {
  return (
    <tbody className="bg-white divide-y divide-gray-200">
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = '', onClick, hoverActions }) {
  return (
    <tr
      className={`relative group ${onClick ? 'cursor-pointer hover:bg-gray-50' : 'hover:bg-gray-50'} ${className}`}
      onClick={onClick}
    >
      {children}
      {hoverActions}
    </tr>
  );
}

export function TableHeader({ children, className = '', onClick, sticky = false, draggable, onDragStart, onDragOver, onDrop, onDragEnd }) {
  return (
    <th
      className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${sticky ? 'sticky-col' : ''} ${className}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className = '', sticky = false }) {
  return (
    <td className={`px-4 py-3 whitespace-nowrap text-sm text-center ${sticky ? 'sticky-col' : ''} ${className}`}>
      {children}
    </td>
  );
}
