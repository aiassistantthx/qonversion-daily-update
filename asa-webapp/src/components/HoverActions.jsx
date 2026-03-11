import { Button } from './Button';

export function HoverActions({ children, className = '' }) {
  return (
    <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-md rounded-lg px-2 py-1 ${className}`}>
      {children}
    </div>
  );
}
