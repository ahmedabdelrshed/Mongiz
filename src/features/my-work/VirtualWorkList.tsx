import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { List, type RowComponentProps } from "react-window";

type RowProps = {
  renderRow: (index: number) => ReactNode;
  onHeight: (index: number, height: number) => void;
};
function VirtualRow({
  index,
  style,
  ariaAttributes,
  renderRow,
  onHeight,
}: RowComponentProps<RowProps>) {
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () =>
      onHeight(index, Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [index, onHeight]);
  return (
    <div {...ariaAttributes} style={style}>
      <div ref={content}>{renderRow(index)}</div>
    </div>
  );
}

export function VirtualWorkList({
  rowCount,
  renderRow,
}: {
  rowCount: number;
  renderRow: (index: number) => ReactNode;
}) {
  const [heights, setHeights] = useState<Record<number, number>>({});
  const onHeight = useCallback((index: number, height: number) => {
    if (height <= 0) return;
    setHeights((previous) =>
      previous[index] === height ? previous : { ...previous, [index]: height },
    );
  }, []);
  // The same function controls positions and total scroll size, including rows
  // not yet measured. This keeps the final row reachable.
  const rowHeight = useCallback(
    (index: number) => heights[index] ?? 100,
    [heights],
  );
  const contentHeight = Array.from({ length: rowCount }, (_, index) =>
    rowHeight(index),
  ).reduce((total, height) => total + height, 0);
  return (
    <List
      className="virtual-work-list"
      aria-label="Stories and tasks"
      style={{
        height: `min(70vh, 720px, ${Math.max(180, contentHeight)}px)`,
        minHeight: 180,
      }}
      defaultHeight={650}
      rowCount={rowCount}
      rowHeight={rowHeight}
      overscanCount={6}
      rowComponent={VirtualRow}
      rowProps={{ renderRow, onHeight }}
    />
  );
}
