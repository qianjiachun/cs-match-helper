import type { GameBarWidgetUpdateCheck } from './types';

/** 调试面板用：模拟「选择下载方式」里的 CDN / GitHub 地址展示 */
export const MOCK_GAMEBAR_WIDGET_UPDATE_CHECK: GameBarWidgetUpdateCheck = {
  installedVersion: '1.0.0',
  latestVersion: '1.0.0',
  hasUpdate: true,
  downloadUrl:
    'https://cdn.lunaris.win/qianjiachun/cs-match-helper-widget/CSMatchHelperGameBarWidget-1.0.0.zip?download&v=1.0.0',
  cdnDownloadUrl:
    'https://cdn.lunaris.win/qianjiachun/cs-match-helper-widget/CSMatchHelperGameBarWidget-1.0.0.zip?download&v=1.0.0',
  githubDownloadUrl:
    'https://github.com/qianjiachun/cs-match-helper/releases/download/v2.2.0/CSMatchHelperGameBarWidget-1.0.0.zip',
  sha256: null,
  zipFileName: 'CSMatchHelperGameBarWidget-1.0.0.zip',
  error: null,
};
