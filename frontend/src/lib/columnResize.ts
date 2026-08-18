import { useCallback, useRef } from 'react';

export const MIN_COLUMN_WIDTH = 60;

/** Drag-to-resize a table column via its trailing-edge handle. Returns a
 * mousedown handler; drag state lives in a ref, not React state, so
 * mousemove during a drag doesn't fight with re-renders — only
 * onResizeColumn's own state update (driven by the caller) triggers one.
 * The starting width is measured straight off the column's own <th> at
 * mousedown time (not looked up from a widths map) — this works uniformly
 * whether the column's current width came from a fixed pixel value or a
 * fluid percentage, since getBoundingClientRect() always returns the real
 * rendered pixel size either way. */
export function useColumnResize<K extends string>(
  onResizeColumn: (column: K, width: number) => void,
) {
  const dragRef = useRef<{ column: K; startX: number; startWidth: number } | null>(null);

  return useCallback((e: React.MouseEvent, column: K) => {
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest('th');
    const startWidth = th?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH;
    dragRef.current = { column, startX: e.clientX, startWidth };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.max(MIN_COLUMN_WIDTH, drag.startWidth + (moveEvent.clientX - drag.startX));
      onResizeColumn(drag.column, next);
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onResizeColumn]);
}
