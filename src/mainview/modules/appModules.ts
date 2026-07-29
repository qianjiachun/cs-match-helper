export type AppModuleId = 'match' | 'counter-strafing';

/** Shell views that host a feature module (settings is not a module). */
export type ModuleAppView = 'main' | 'counter-strafing';

export type AppModuleDef = {
  id: AppModuleId;
  view: ModuleAppView;
  titleKey: string;
  categoryKey: string;
  descriptionKey: string;
  actionLabelKey: string;
};

export const LAST_MODULE_STORAGE_KEY = 'csmh-last-module';

export const APP_MODULES: readonly AppModuleDef[] = [
  {
    id: 'match',
    view: 'main',
    titleKey: 'home.matchTitle',
    categoryKey: 'home.matchCategory',
    descriptionKey: 'home.matchDescription',
    actionLabelKey: 'home.matchAction',
  },
  {
    id: 'counter-strafing',
    view: 'counter-strafing',
    titleKey: 'home.counterTitle',
    categoryKey: 'home.counterCategory',
    descriptionKey: 'home.counterDescription',
    actionLabelKey: 'home.counterAction',
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

export function resolveInitialView(): ModuleAppView {
  return 'main';
}
