import { ref } from 'vue';
import {
  startCounterStrafing,
  stopCounterStrafing,
} from '@core/counter-strafing/native';
import type { CounterStrafingSnapshot } from '@core/counter-strafing/types';
import { useCounterStrafingDisplayMode } from './useCounterStrafingDisplayMode';
import { showToast } from './useCopyFeedback';

/** 急停助手是否正在记录（跨视图共享，供 TitleBar 等使用） */
export const counterStrafingListening = ref(false);

/** 顶栏/控制台共用的开停记录忙碌态 */
export const counterStrafingSessionBusy = ref(false);

type SnapshotListener = (snapshot: CounterStrafingSnapshot) => void;
const snapshotListeners = new Set<SnapshotListener>();

/** 订阅会话 start/stop 返回的 snapshot（供详情页合并本地状态） */
export function onCounterStrafingSessionSnapshot(listener: SnapshotListener) {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

function emitSessionSnapshot(snapshot: CounterStrafingSnapshot) {
  counterStrafingListening.value = snapshot.listening;
  for (const listener of snapshotListeners) {
    listener(snapshot);
  }
}

export type ToggleListeningResult =
  | { ok: true; snapshot: CounterStrafingSnapshot }
  | { ok: false; error: string };

/**
 * 开/关急停记录。可从顶栏直接调用，不依赖详情页是否已挂载。
 */
export async function toggleCounterStrafingListening(options?: {
  toastOnError?: boolean;
}): Promise<ToggleListeningResult> {
  if (counterStrafingSessionBusy.value) {
    return { ok: false, error: '正在处理中，请稍候' };
  }

  const { displayMode } = useCounterStrafingDisplayMode();
  counterStrafingSessionBusy.value = true;
  try {
    let snapshot: CounterStrafingSnapshot;
    if (counterStrafingListening.value) {
      snapshot = await stopCounterStrafing();
    } else {
      const showHud = displayMode.value === 'hud';
      snapshot = await startCounterStrafing(showHud);
      if (!snapshot.listening) {
        throw new Error('按键监听未成功启动，请重试');
      }
    }
    emitSessionSnapshot(snapshot);
    return { ok: true, snapshot };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (options?.toastOnError !== false) {
      showToast(error, 'warning');
    }
    return { ok: false, error };
  } finally {
    counterStrafingSessionBusy.value = false;
  }
}

export function useCounterStrafingSession() {
  return {
    listening: counterStrafingListening,
    busy: counterStrafingSessionBusy,
    toggleListening: () => toggleCounterStrafingListening({ toastOnError: true }),
  };
}
