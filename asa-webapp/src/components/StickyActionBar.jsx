export function StickyActionBar({ children, show = true, className = '' }) {
  if (!show) return null;

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-40
        bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700
        px-4 py-3 shadow-lg
        md:hidden
        ${className}
      `}
      style={{
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))'
      }}
    >
      <div className="flex items-center justify-between gap-2">
        {children}
      </div>
    </div>
  );
}
