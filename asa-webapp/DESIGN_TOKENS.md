# Design Tokens

This document defines the design tokens used in the ASA webapp for consistent styling across all components.

## Colors

### Status Colors

Status colors are used for badges, alerts, and indicators across the application.

#### Success
- **Background (light):** `#dcfce7` (green-100)
- **Text (light):** `#166534` (green-800)
- **Background (dark):** `#14532d` (green-900)
- **Text (dark):** `#bbf7d0` (green-200)
- **Usage:** Tailwind classes `bg-status-success-bg`, `text-status-success-text`

#### Warning
- **Background (light):** `#fef3c7` (yellow-100)
- **Text (light):** `#854d0e` (yellow-800)
- **Background (dark):** `#713f12` (yellow-900)
- **Text (dark):** `#fef08a` (yellow-200)
- **Usage:** Tailwind classes `bg-status-warning-bg`, `text-status-warning-text`

#### Error
- **Background (light):** `#fee2e2` (red-100)
- **Text (light):** `#991b1b` (red-800)
- **Background (dark):** `#7f1d1d` (red-900)
- **Text (dark):** `#fecaca` (red-200)
- **Usage:** Tailwind classes `bg-status-error-bg`, `text-status-error-text`

#### Info
- **Background (light):** `#dbeafe` (blue-100)
- **Text (light):** `#1e40af` (blue-800)
- **Background (dark):** `#1e3a8a` (blue-900)
- **Text (dark):** `#bfdbfe` (blue-200)
- **Usage:** Tailwind classes `bg-status-info-bg`, `text-status-info-text`

### Traffic Light Colors

Used in campaign health indicators based on predicted ROAS.

- **OK:** `#10b981` (green-500) - ROAS >= 1.5
- **Risk:** `#f59e0b` (amber-500) - 1.0 <= ROAS < 1.5
- **Bad:** `#f97316` (orange-500) - 0.5 <= ROAS < 1.0
- **Loss:** `#ef4444` (red-500) - ROAS < 0.5
- **Unknown:** `#9ca3af` (gray-400) - No data
- **Usage:** Tailwind classes `bg-traffic-ok`, `text-traffic-ok`, etc.

### Health Score Colors

Used in campaign health scoring widgets.

- **Good:** `#22c55e` (green-500) - Score >= 80
- **Warning:** `#eab308` (yellow-500) - 60 <= Score < 80
- **Critical:** `#ef4444` (red-500) - Score < 60
- **Usage:** Tailwind classes `text-health-good`, `text-health-warning`, `text-health-critical`

## Border Radius

Standardized border radius values for consistent component appearance.

- **xs:** `6px` - Small elements (buttons in compact views)
- **sm:** `8px` - Default for most components
- **md:** `8px` - Same as sm (deprecated, use sm)
- **lg:** `12px` - Cards, modals, larger containers
- **xl:** `16px` - Hero sections, large panels
- **full:** `9999px` - Circular badges, pills

**Usage:** Use Tailwind classes `rounded-xs`, `rounded-sm`, `rounded-lg`, etc.

## Shadows

Standardized shadow depths for elevation hierarchy.

- **sm:** `0 1px 2px 0 rgb(0 0 0 / 0.05)` - Subtle elevation for small elements
- **default:** `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` - Standard cards
- **md:** `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` - Elevated panels
- **lg:** `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` - Modals, popovers

**Usage:** Use Tailwind classes `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`

## Component Guidelines

### Badge Component

```jsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">Paused</Badge>
<Badge variant="error">Deleted</Badge>
<Badge variant="info">Pending</Badge>
```

### Card Component

```jsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

Cards use `rounded-lg` and `shadow-sm` by default.

### Button Component

```jsx
<Button variant="primary">Primary Action</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="success">Confirm</Button>
<Button variant="danger">Delete</Button>
<Button variant="ghost">Cancel</Button>
```

Buttons use `rounded-lg` by default.

### Traffic Light Indicator

```jsx
<TrafficLight predictedRoas={1.8} size="sm" />
```

Displays color-coded campaign health based on ROAS predictions.

## Dark Mode Support

All design tokens include dark mode variants. Components automatically switch based on the `dark` class on the root element.

To enable dark mode, add `class="dark"` to the `<html>` or `<body>` element.

## Implementation Notes

1. **Avoid inline styles** - Always use Tailwind classes instead of inline `style` attributes
2. **Use design tokens** - Reference the standardized color tokens instead of arbitrary color values
3. **Consistent spacing** - Follow Tailwind's spacing scale (4px increments)
4. **Accessibility** - Ensure sufficient color contrast (WCAG AA minimum)

## Migration Guide

When updating existing components:

1. Replace inline `style={{ borderRadius: 12 }}` with `className="rounded-lg"`
2. Replace inline `style={{ boxShadow: '...' }}` with `className="shadow-sm"`
3. Replace hardcoded colors with status color tokens
4. Add dark mode variants where missing

Example:

```jsx
// Before
<div style={{ background: '#dcfce7', color: '#166534', borderRadius: 8 }}>
  Success
</div>

// After
<div className="bg-status-success-bg text-status-success-text dark:bg-status-success-dark-bg dark:text-status-success-dark-text rounded-lg">
  Success
</div>
```
