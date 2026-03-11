export function EmptyState({ icon: Icon, title, description, action, variant = 'default' }) {
  const variants = {
    default: 'text-gray-400',
    search: 'text-blue-400',
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon && (
        <div className={`mb-4 ${variants[variant]}`}>
          <Icon size={64} strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
          {description}
        </p>
      )}
      {action && action}
    </div>
  );
}
