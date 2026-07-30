import { counterStrafingListening } from './useCounterStrafingSession';

export { counterStrafingListening } from './useCounterStrafingSession';

/** 急停 HUD 是否正在记录（跨视图共享，供 TitleBar 等使用） */
export function useCounterStrafingListening() {
  return counterStrafingListening;
}
