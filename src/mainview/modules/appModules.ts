import type { Component } from 'vue';
import HomePreviewMatch from '../components/home/HomePreviewMatch.vue';
import HomePreviewCounterStrafing from '../components/home/HomePreviewCounterStrafing.vue';

export type AppModuleId = 'match' | 'counter-strafing';

/** Shell views that host a feature module (settings/home are not modules). */
export type ModuleAppView = 'main' | 'counter-strafing';

export type AppModuleDef = {
  id: AppModuleId;
  view: ModuleAppView;
  title: string;
  category: string;
  description: string;
  actionLabel: string;
  Preview: Component;
};

export const LAST_MODULE_STORAGE_KEY = 'csmh-last-module';

export const APP_MODULES: readonly AppModuleDef[] = [
  {
    id: 'match',
    view: 'main',
    title: '匹配助手',
    category: '赛前分析',
    description: '在开局前查看双方阵容与关键数据，快速建立判断。',
    actionLabel: '打开匹配助手',
    Preview: HomePreviewMatch,
  },
  {
    id: 'counter-strafing',
    view: 'counter-strafing',
    title: '急停助手',
    category: '枪法训练',
    description: '捕捉 A / D 松按时机，把每一次急停练成稳定手感。',
    actionLabel: '打开急停助手',
    Preview: HomePreviewCounterStrafing,
  },
] as const;

export function moduleIdFromView(view: string): AppModuleId | null {
  const found = APP_MODULES.find((m) => m.view === view);
  return found?.id ?? null;
}

export function viewFromModuleId(id: string): ModuleAppView | null {
  const found = APP_MODULES.find((m) => m.id === id);
  return found?.view ?? null;
}

export function readLastModuleId(): AppModuleId | null {
  try {
    const raw = localStorage.getItem(LAST_MODULE_STORAGE_KEY)?.trim();
    if (!raw) return null;
    return viewFromModuleId(raw) ? (raw as AppModuleId) : null;
  } catch {
    return null;
  }
}

export function writeLastModuleId(id: AppModuleId): void {
  try {
    localStorage.setItem(LAST_MODULE_STORAGE_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

export function resolveInitialView(): 'home' | ModuleAppView {
  return 'home';
}
