export function TableSkeleton({ rows = 5, columns = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="animate-pulse">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="px-4 py-3">
              <div className="h-4 bg-gray-200 rounded shimmer"></div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-lg bg-gray-200 shimmer">
          <div className="h-6 w-6"></div>
        </div>
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded shimmer mb-2 w-24"></div>
          <div className="h-6 bg-gray-200 rounded shimmer w-32"></div>
        </div>
      </div>
    </div>
  );
}

export function DashboardCardSkeleton() {
  return (
    <div className="p-4 border rounded-lg">
      <div className="animate-pulse flex items-center gap-4">
        <div className="p-3 rounded-lg bg-gray-200 shimmer">
          <div className="h-6 w-6"></div>
        </div>
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded shimmer mb-2 w-20"></div>
          <div className="h-8 bg-gray-200 rounded shimmer w-24"></div>
        </div>
      </div>
    </div>
  );
}
