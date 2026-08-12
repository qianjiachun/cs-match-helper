import { createI18n } from 'vue-i18n';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

export const APP_LOCALES = ['zh-CN', 'en-US'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export type LocalePreference = 'system' | AppLocale;

const STORAGE_KEY = 'cs-match-helper.locale-preference.v1';

export const I18N_MESSAGES = { 'zh-CN': zhCN, 'en-US': enUS } as const;

export function resolveSystemLocale(
  language = typeof navigator !== 'undefined' ? navigator.language : 'en-US',
): AppLocale {
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function readLocalePreference(): LocalePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'zh-CN' || value === 'en-US' || value === 'system') return value;
  } catch {
    // Storage can be unavailable in restricted WebViews.
  }
  return 'system';
}

export function resolveLocale(preference: LocalePreference): AppLocale {
  return preference === 'system' ? resolveSystemLocale() : preference;
}

export function persistLocalePreference(preference: LocalePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The active session still switches even if persistence fails.
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveLocale(readLocalePreference()),
  fallbackLocale: 'en-US',
  messages: I18N_MESSAGES,
});

export function currentLocale(): AppLocale {
  return i18n.global.locale.value as AppLocale;
}

/** Reactive inline copy helper for one-off UI phrases. */
export function localize(zhCNText: string, enUSText: string): string {
  return currentLocale() === 'zh-CN' ? zhCNText : enUSText;
}

const EN_ERROR_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['无法获取程序路径', 'Could not locate the application executable'],
  ['无法获取程序所在目录', 'Could not locate the application directory'],
  ['无法定位程序目录', 'Could not locate the application directory'],
  ['读取设置失败', 'Could not read settings'],
  ['解析设置失败', 'Could not parse settings'],
  ['保存设置失败', 'Could not save settings'],
  ['序列化设置失败', 'Could not serialize settings'],
  ['AI 分析已在设置中关闭', 'AI analysis is disabled in Settings'],
  ['请先在设置中配置 API Key', 'Add an API key in Settings first'],
  ['请先在设置中配置 API Base URL', 'Add an API base URL in Settings first'],
  ['请先在设置中配置模型名称', 'Add a model name in Settings first'],
  ['创建 HTTP 客户端失败', 'Could not create the HTTP client'],
  ['请求 AI 服务失败', 'Could not reach the AI service'],
  ['AI API 错误', 'AI API error'],
  ['读取流式响应失败', 'Could not read the streaming response'],
  ['解析 SSE 数据失败', 'Could not parse SSE data'],
  ['AI 返回内容为空', 'The AI returned an empty response'],
  ['获取发布列表失败', 'Could not fetch releases'],
  ['解析发布列表失败', 'Could not parse the release list'],
  ['获取更新详情失败', 'Could not fetch release details'],
  ['解析更新详情失败', 'Could not parse release details'],
  ['检查更新失败', 'Could not check for updates'],
  ['解析更新信息失败', 'Could not parse update information'],
  ['下载更新失败', 'Could not download the update'],
  ['文件校验失败', 'File verification failed'],
  ['更新文件不存在，请重新下载', 'The update file is missing. Download it again'],
  ['版本号无效', 'Invalid version number'],
  ['该版本不可用', 'This version is unavailable'],
  ['未找到版本', 'Could not find version'],
  ['的发布说明', ' release notes'],
  ['创建历史目录失败', 'Could not create the history directory'],
  ['读取历史索引失败', 'Could not read the match-history index'],
  ['解析历史索引失败', 'Could not parse the match-history index'],
  ['读取历史条目失败', 'Could not read the match-history entry'],
  ['解析历史条目失败', 'Could not parse the match-history entry'],
  ['历史条目不存在', 'The match-history entry does not exist'],
  ['历史文档格式无效', 'The match-history document is invalid'],
  ['请右键「CS 匹配助手」→「以管理员身份运行」后重试', 'Right-click CS Match Helper, select Run as administrator, and try again'],
  ['指定的 5E 目录无效', 'The selected 5E directory is invalid'],
  ['未找到 5E 客户端，请手动选择安装目录', 'Could not find the 5E client. Select its install directory manually'],
  ['无法启动 5E', 'Could not launch 5E'],
  ['无法连接 CDP', 'Could not connect to CDP'],
  ['CDP 列表解析失败', 'Could not parse the CDP target list'],
  ['5E 进程已退出', 'The 5E process has exited'],
  ['路径不存在', 'Path does not exist'],
  ['无法获取配置目录', 'Could not locate the configuration directory'],
  ['客户端身份无效', 'The local comment identity is invalid'],
  ['服务器响应格式错误', 'The comment service returned an invalid response'],
  ['完美留言板加载失败', 'Could not load the Perfect World message board'],
  ['5E 留言板加载失败', 'Could not load the 5E message board'],
  ['请求失败', 'Request failed'],
  ['操作失败，请稍后重试', 'The action failed. Try again later'],
];

/** Localize app/backend error summaries while retaining unknown diagnostic details verbatim. */
export function localizeErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error)).replace(/^Error:\s*/, '');
  if (currentLocale() === 'zh-CN') return raw;
  let translated = raw;
  for (const [source, target] of EN_ERROR_REPLACEMENTS) {
    translated = translated.replaceAll(source, target);
  }
  return translated;
}

export function setDocumentLocale(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = locale === 'zh-CN' ? 'CS 匹配助手' : 'CS Match Helper';
}

export function applyResolvedLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
  setDocumentLocale(locale);
}

export async function setLocale(
  preference: LocalePreference,
  syncNative?: (locale: AppLocale) => Promise<void>,
): Promise<AppLocale> {
  persistLocalePreference(preference);
  const locale = resolveLocale(preference);
  i18n.global.locale.value = locale;
  setDocumentLocale(locale);
  await syncNative?.(locale);
  return locale;
}
