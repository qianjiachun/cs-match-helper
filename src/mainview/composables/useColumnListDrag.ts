import { onUnmounted, ref, type CSSProperties, type Ref } from 'vue';
import type { TeamTableColumnKey } from '../components/team-table-columns';

const ROW_GAP_PX = 4;

interface RowLayout {
  top: number;
  height: number;
}

export function useColumnListDrag(
  keys: Ref<TeamTableColumnKey[]>,
  onCommit: () => void,
) {
  const draggingKey = ref<TeamTableColumnKey | null>(null);
  const dragOffsetY = ref(0);
  const hoverIndex = ref(-1);
  const dragOriginIndex = ref(-1);

  const rowRefs = new Map<TeamTableColumnKey, HTMLElement>();
  let layoutSnapshot: RowLayout[] = [];
  let startPointerY = 0;
  let activePointerId = -1;

  function setRowRef(key: TeamTableColumnKey, el: unknown) {
    if (el instanceof HTMLElement) rowRefs.set(key, el);
    else rowRefs.delete(key);
  }

  function isDragging(key: TeamTableColumnKey) {
    return draggingKey.value === key;
  }

  function getShiftPx(index: number) {
    if (draggingKey.value === null || dragOriginIndex.value < 0) return 0;
    const from = dragOriginIndex.value;
    const to = hoverIndex.value;
    if (from === to) return 0;

    const stride = (layoutSnapshot[from]?.height ?? 0) + ROW_GAP_PX;
    if (from < to && index > from && index <= to) return -stride;
    if (from > to && index >= to && index < from) return stride;
    return 0;
  }

  function rowStyle(key: TeamTableColumnKey, index: number): CSSProperties {
    if (isDragging(key)) {
      return {
        transform: `translate3d(0, ${dragOffsetY.value}px, 0)`,
        zIndex: 30,
        position: 'relative',
        transition: 'none',
      };
    }

    const shift = getShiftPx(index);
    return {
      transform: shift ? `translate3d(0, ${shift}px, 0)` : undefined,
      transition: 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
    };
  }

  function targetIndexFromPointer(clientY: number) {
    let index = 0;
    for (let i = 0; i < layoutSnapshot.length; i += 1) {
      const slot = layoutSnapshot[i];
      if (clientY > slot.top + slot.height / 2) index = i;
    }
    return index;
  }

  function onPointerMove(event: PointerEvent) {
    if (draggingKey.value === null || event.pointerId !== activePointerId) return;
    dragOffsetY.value = event.clientY - startPointerY;
    hoverIndex.value = targetIndexFromPointer(event.clientY);
  }

  function finishDrag(event?: PointerEvent) {
    if (event && activePointerId >= 0 && event.pointerId !== activePointerId) return;

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finishDrag);
    window.removeEventListener('pointercancel', finishDrag);

    if (draggingKey.value === null) return;

    const from = dragOriginIndex.value;
    const to = hoverIndex.value;
    if (from >= 0 && to >= 0 && from !== to) {
      const next = [...keys.value];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      keys.value = next;
      onCommit();
    }

    draggingKey.value = null;
    dragOffsetY.value = 0;
    hoverIndex.value = -1;
    dragOriginIndex.value = -1;
    layoutSnapshot = [];
    activePointerId = -1;
  }

  function onGripPointerDown(key: TeamTableColumnKey, index: number, event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();

    const row = rowRefs.get(key);
    if (!row) return;

    layoutSnapshot = keys.value.map((rowKey) => {
      const el = rowRefs.get(rowKey);
      const rect = el!.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });

    draggingKey.value = key;
    dragOriginIndex.value = index;
    hoverIndex.value = index;
    startPointerY = event.clientY;
    dragOffsetY.value = 0;
    activePointerId = event.pointerId;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  }

  onUnmounted(finishDrag);

  return {
    draggingKey,
    isDragging,
    rowStyle,
    setRowRef,
    onGripPointerDown,
  };
}
