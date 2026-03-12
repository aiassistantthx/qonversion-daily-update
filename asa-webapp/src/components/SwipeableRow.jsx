import { useState, useRef, useEffect } from 'react';

export function SwipeableRow({
  children,
  actions = [],
  className = '',
  onSwipeStart,
  onSwipeEnd
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const rowRef = useRef(null);

  const SWIPE_THRESHOLD = 60;
  const MAX_SWIPE = 120;

  const handleTouchStart = (e) => {
    if (actions.length === 0) return;
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;
    setIsSwiping(true);
    onSwipeStart?.();
  };

  const handleTouchMove = (e) => {
    if (!isSwiping || actions.length === 0) return;

    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;

    // Only allow swipe left
    if (diff < 0) {
      const offset = Math.max(diff, -MAX_SWIPE);
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;

    const diff = currentX.current - startX.current;

    if (diff < -SWIPE_THRESHOLD) {
      setSwipeOffset(-MAX_SWIPE);
    } else {
      setSwipeOffset(0);
    }

    setIsSwiping(false);
    onSwipeEnd?.();
  };

  const handleActionClick = (action) => {
    action.onClick?.();
    setSwipeOffset(0);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target) && swipeOffset !== 0) {
        setSwipeOffset(0);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [swipeOffset]);

  return (
    <div className="relative overflow-hidden" ref={rowRef}>
      {/* Actions background */}
      {actions.length > 0 && (
        <div className="absolute right-0 top-0 bottom-0 flex items-stretch bg-gray-100">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleActionClick(action)}
              className={`
                flex items-center justify-center px-4 min-w-[60px]
                ${action.variant === 'danger' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}
                ${action.variant === 'primary' ? 'bg-blue-500 text-white' : ''}
                hover:opacity-90 transition-opacity
              `}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      <div
        className={`relative ${className}`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
