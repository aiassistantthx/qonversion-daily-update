# Mobile Responsiveness Components Guide

## Overview

This guide explains how to use the new mobile-friendly components added to the ASA webapp.

## Components

### 1. SwipeableRow

Add swipe actions to table rows for quick access to common operations.

**Usage:**

```jsx
import { SwipeableRow } from '../components/SwipeableRow';
import { Trash2, Edit } from 'lucide-react';

<SwipeableRow
  actions={[
    {
      label: 'Edit',
      icon: <Edit size={16} />,
      variant: 'primary',
      onClick: () => handleEdit(row)
    },
    {
      label: 'Delete',
      icon: <Trash2 size={16} />,
      variant: 'danger',
      onClick: () => handleDelete(row)
    }
  ]}
>
  <TableRow>
    {/* Your table cells */}
  </TableRow>
</SwipeableRow>
```

**Features:**
- Swipe left to reveal actions
- Touch-friendly interaction
- Automatically closes on outside click
- Max 2-3 actions recommended

### 2. BottomSheet

Mobile-optimized modal that slides up from the bottom.

**Usage:**

```jsx
import { BottomSheet } from '../components/BottomSheet';

<BottomSheet
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Edit Campaign"
>
  {/* Your content */}
</BottomSheet>
```

**Features:**
- Automatically uses regular modal on desktop
- Swipe down to dismiss
- Supports drag handle
- Respects safe area insets

### 3. StickyActionBar

Fixed action bar at the bottom of the screen for mobile.

**Usage:**

```jsx
import { StickyActionBar } from '../components/StickyActionBar';

<StickyActionBar show={selectedCount > 0}>
  <div className="flex-1">
    <div className="text-sm font-medium">{selectedCount} selected</div>
  </div>
  <Button size="sm" onClick={handleAction}>
    Actions
  </Button>
</StickyActionBar>
```

**Features:**
- Fixed to bottom on mobile only
- Hidden on desktop (md breakpoint)
- Respects safe area insets
- z-index optimized

### 4. Enhanced Table with Scroll Hint

Tables now show a visual hint when horizontal scrolling is available.

**Usage:**

```jsx
import { Table } from '../components/Table';

<Table stickyFirstColumn showScrollHint>
  {/* Your table content */}
</Table>
```

**Features:**
- Animated chevron indicator
- Disappears after scroll
- Mobile-only (hidden on desktop)
- Works with sticky columns

## Hooks

### useIsMobile

Detect if the user is on a mobile device.

**Usage:**

```jsx
import { useIsMobile } from '../hooks/useIsMobile';

function MyComponent() {
  const isMobile = useIsMobile(); // Default breakpoint: 768px
  const isSmallMobile = useIsMobile(640); // Custom breakpoint

  return (
    <div>
      {isMobile ? <MobileView /> : <DesktopView />}
    </div>
  );
}
```

## Touch-Friendly Sizes

All buttons now have minimum touch-friendly sizes:
- `sm`: 36px min height
- `md`: 44px min height (recommended for mobile)
- `lg`: 48px min height

Table rows on mobile automatically have increased touch targets (52px min height).

## Best Practices

1. **Use BottomSheet for mobile modals**
   - Automatically falls back to regular Modal on desktop
   - Better UX for mobile users

2. **Add swipe actions sparingly**
   - Limit to 2-3 most common actions
   - Use clear, recognizable icons
   - Consider color coding (red for delete, blue for edit)

3. **Test on real devices**
   - Emulators don't capture touch interactions perfectly
   - Test swipe gestures and scrolling
   - Verify safe area insets on notched devices

4. **Responsive action bars**
   - Use StickyActionBar for mobile
   - Keep desktop floating toolbars
   - Ensure actions are accessible in both views

5. **Table scrolling**
   - Always enable scroll hints for wide tables
   - Consider sticky first column for key info
   - Test horizontal scroll performance

## Migration Example

### Before:
```jsx
<Modal open={open} onClose={onClose} title="Edit">
  <form>{/* ... */}</form>
</Modal>
```

### After:
```jsx
import { useIsMobile } from '../hooks/useIsMobile';
import { BottomSheet } from '../components/BottomSheet';
import { Modal } from '../components/Modal';

const ModalComponent = useIsMobile() ? BottomSheet : Modal;

<ModalComponent open={open} onClose={onClose} title="Edit">
  <form>{/* ... */}</form>
</ModalComponent>
```

## CSS Classes

New utility classes available:
- `.page-container` - Adds safe area inset padding on mobile
- `.icon-only` - For icon-only buttons (excludes min-width)

## Browser Support

- iOS Safari 12+
- Android Chrome 80+
- All modern mobile browsers
- Graceful degradation for older browsers
