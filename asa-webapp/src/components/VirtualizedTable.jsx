import { FixedSizeList } from 'react-window';
import { TableRow, TableCell } from './Table';
import { memo } from 'react';

const Row = memo(({ index, style, data }) => {
  const { items, renderRow } = data;
  const item = items[index];

  return (
    <div style={style}>
      {renderRow(item, index)}
    </div>
  );
});

Row.displayName = 'VirtualizedRow';

export function VirtualizedTable({
  items,
  renderRow,
  height = 600,
  itemSize = 48,
  className = ''
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <FixedSizeList
        height={height}
        itemCount={items.length}
        itemSize={itemSize}
        width="100%"
        itemData={{ items, renderRow }}
      >
        {Row}
      </FixedSizeList>
    </div>
  );
}
