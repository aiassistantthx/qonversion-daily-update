export function Table({ children, className = '', stickyFirstColumn = false }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className={`min-w-full divide-y divide-gray-200 ${stickyFirstColumn ? 'mobile-sticky-table' : ''}`}>
        {children}
      </table>
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
