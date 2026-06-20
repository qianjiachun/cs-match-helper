import { invoke } from '@tauri-apps/api/core';

const LEGACY_STORAGE_KEY = 'p5e-client-root';

/** 从 cs-match-helper-settings.json 读取已保存的 5E 客户端路径 */
export async function loadP5eClientRoot(): Promise<string | null> {
  const saved = await invoke<string | null>('load_p5e_client_root');
  if (saved?.trim()) return saved.trim();

  // 一次性迁移旧版 localStorage 数据
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)?.trim();
    if (legacy) {
      await saveP5eClientRoot(legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
  } catch {
    // ignore
  }

  return null;
}

/** 写入 cs-match-helper-settings.json */
export async function saveP5eClientRoot(root: string | null): Promise<void> {
  await invoke('save_p5e_client_root', {
    clientRoot: root?.trim() || null,
  });
}
