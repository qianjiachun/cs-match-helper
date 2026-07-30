import { createI18n } from 'vue-i18n';

export const APP_LOCALES = ['zh-CN', 'en-US'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export type LocalePreference = 'system' | AppLocale;

const STORAGE_KEY = 'cs-match-helper.locale-preference.v1';

const zhCN = {
  common: {
    appName: 'CS 匹配助手',
    chinese: '简体中文',
    english: 'English',
    language: '语言',
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    close: '关闭',
    back: '返回',
    loading: '加载中…',
    retry: '重试',
    unknown: '未知',
    home: '首页',
    settings: '设置',
    debug: '调试',
    exit: '退出',
    minimize: '最小化',
    maximize: '最大化',
    previous: '返回上一页',
    newVersion: '有新版本',
    newVersionAria: '发现新版本',
    confirmExit: '确定退出',
  },
  settings: {
    title: '设置',
    nav: '设置导航',
    languageTitle: '界面语言',
    history: '历史对局',
    historyDesc: '查看本地保存的对局与 AI 分析',
    ai: 'AI 设置',
    aiDesc: 'API 与模型配置',
    comments: '我的评论',
    commentsDesc: '查看和管理你发表过的评论',
    changelog: '更新日志',
    changelogDesc: '版本更新记录与功能说明',
    about: '关于',
    aboutDesc: '版本与作者信息',
  },
  hud: {
    counterStrafing: '急停评估',
    shooting: '开枪稳定',
    averageTiming: '平均时机',
    successRate: '成功率',
    consistency: '稳定性',
    tendency: '倾向',
    averageError: '平均误差',
    stableRate: '稳定率',
    perfect: '完美',
    good: '优秀',
    early: '偏早',
    late: '偏晚',
    drag: '拖动 HUD',
    initError: 'HUD 初始化失败',
    assessmentInitError: '急停评估 HUD 初始化失败',
    error: '误差',
    stable: '稳定',
    average: '平均',
    goodRate: '优秀率',
    standardDeviation: '标准差',
    normal: '正常',
  },
  aiErrors: {
    mapSupplementParse: '地图补充结果无法解析，请重试',
    responseParse: 'AI 返回格式无法解析，请重试',
    injectParse: 'AI 结果 JSON 无法解析，请检查格式',
  },
  aiUi: {
    closeData: '双方数据接近，等待 AI 细化判断', localLead: '本地初判：队伍 {side} 综合数据略优', needKey: '请先在设置中填写 API Key 以启用 AI 分析', disabled: 'AI 分析已关闭，可在设置中开启', calibrating: '{headline}，AI 正在校准…', waiting: '等待 AI 分析…', confidence: '数据把握 {value}%', confidenceReason: '数据把握 {value}% · {reason}', calculating: '统计中…', tokens: '输入 {input} · 输出 {output} · 合计 {total}', tokenBreakdown: '首轮 输入 {baseInput} · 输出 {baseOutput} · 地图补充 输入 {mapInput} · 输出 {mapOutput}', missingConfig: '缺少必要配置', fillKey: '请先填写', keyExplanation: '你已在设置中开启 AI 分析，但尚未填写 {label}。填写后即可使用赛前预测与维度分析。', findKey: '在设置中找到「{label}」并粘贴你的 Key', noKey: '还没有 Key？', getDeepSeekKey: '前往 DeepSeek 获取 API Key', providerKey: '请向你所选服务商获取兼容 OpenAI 的 API Key。', configureKey: '去设置填写 API Key', notEnabled: '未开启 AI 分析', enableDesc: '开启后，匹配助手将根据双方数据进行胜负预测与维度分析。', enable: '去设置中开启', incomplete: '分析未完成', noHistory: '本局暂无赛前分析', retryHistory: '可重新生成，结果会写回本局历史', generateHistory: '可按当时对局数据补跑，并保存至历史记录', generate: '生成分析', stopAnalysis: '停止分析', mapSupplement: '地图已确认，正在补充分析…', disclaimer: '赛前胜率预估，非对局结果', elapsed: '耗时 {value}', reanalyze: '重新分析', languageMismatch: '此结果为其他语言', regenerateCurrentLanguage: '使用当前语言重新生成', stop: '停止', highlights: '看点', risks: '风险', waitingReturn: '等待 AI 返回…', noRisks: '暂无显著风险', keyPlayers: '重点玩家', team: '队伍 {side}',
  },
  home: {
    productName: '匹配助手',
    navigation: '工具导航',
    open: '打开{title}',
    matchTitle: '匹配助手',
    matchCategory: '赛前分析',
    matchDescription: '在开局前查看双方阵容与关键数据，快速建立判断。',
    matchAction: '打开匹配助手',
    counterTitle: '急停 HUD',
    counterCategory: '枪法训练',
    counterDescription: '捕捉 A / D 松按时机，把每一次急停练成稳定手感。',
    counterAction: '打开急停 HUD',
  },
  platform: {
    title: '选择对战平台',
    regionLabel: '中国 CS 平台',
    hudLabel: '需要使用急停 HUD？',
    hudHint: '点击软件标题右侧的控件。',
    perfect: '完美世界对战平台',
    perfectDesc: '自动检测对局数据，无需其他操作',
    fiveE: '5E 对战平台',
    fiveEDesc: '需通过本软件启动对战平台',
  },
  p5e: {
    checking: '正在检查环境…', pathPrompt: '请填写或选择 5E 客户端路径', restarting: '正在结束已运行的 5E 并重新启动…', launching: '正在启动 5E…', running: '检测到 5E 正在运行，点击启动将自动结束并重新启动', connected: '已连接，等待对局', connectionError: '连接出现问题', clickLaunch: '点击下方按钮启动', emptyPath: '请输入 5E 客户端路径', invalidPath: '路径无效，请指向包含 5EClient.exe 的目录', pickerTitle: '选择 5EClient.exe', client: '5E 客户端', externalDebug: '检测到外部 5E 调试连接，请手动完全退出 5E 后重试', changePlatform: '更换平台', title: '启动 5E 对战平台', pathValid: '路径有效', clientMissing: '未找到客户端', pathLabel: '客户端路径', pathPlaceholder: '包含 5EClient.exe 的目录路径', browse: '浏览文件', pathHelp: '支持手动输入或粘贴路径，验证通过后自动保存', runningHelp: '5E 正在运行。点击「立即启动」将尝试自动结束进程；若失败请按下方提示手动退出。', waking: '正在唤起客户端…', launchNow: '立即启动 5E',
  },
  counter: {
    title: '急停 HUD', nav: '急停 HUD 导航', console: '控制台', data: '数据', keys: '键位', advanced: '高级设置', guide: '说明', consoleDesc: '选择显示模式、开启记录并完成准备', dataDesc: '急停时机与开枪稳定的汇总统计、趋势与最近一次表现', guideDesc: '开枪稳定与急停评估的功能说明与指标释义', keysDesc: '自定义方向键、蹲键与开火键', advancedDesc: '移速模型、采样校准与判定参数', reset: '恢复默认设置', resetDesc: '键位、悬浮窗与高级参数', restartSteps1: '完全退出 CS 匹配助手', restartSteps2: '在桌面或开始菜单找到程序图标', restartSteps3: '右键 → 以管理员身份运行', restartSteps4: '返回急停 HUD，再次点击「开始记录」', restarting: '正在重启…', restartAdmin: '以管理员身份重启', keyMap: '按键映射', keyMapDesc: '方向键、蹲键、开火键均可自定义', pressKey: '按下新键…', resetKeys: '恢复默认 WASD / Ctrl / 鼠标左键', judgement: '判定与显示', judgementDesc: '调整稳定判定、急停评估与统计窗口', historyCount: '统计数据条数', historyCountDesc: '开枪直方图与急停图表共用，影响平均误差、稳定率、标准差等统计', recordsUnit: '条', assessment: '急停评估', assessmentDesc: '反向切换时机与分级', horizontal: '横向急停', vertical: '纵向急停', perfect: '完美', good: '优秀', validWindow: '有效窗口', assessmentHelp: '偏差分级自上而下收紧；超出有效窗口的切换不计入评估', shooting: '开枪稳定', shootingDesc: '速度达标与误差判定', lowSpeedWindow: '起步低速窗口', stableThreshold: '稳定误差阈值', shootingHelp: '低速窗口默认 180ms；误差阈值默认 0.35，越低越难判绿', movementModel: '移速模型', movementModelDesc: '调整加速度、急停制动与自然减速', maxSpeed: '最大移速', acceleration: '起步加速度 (/s)', counterBrake: '急停制动 (/s)', naturalDecel: '自然减速 (/s)', accurateRatio: '准确速度比例', resetMovement: '恢复移速模型默认值', fireSampling: '开火采样校准', fireSamplingDesc: '对齐 CS2 射击判定', firstShotDelay: '首发延迟 (ms)', tapWindow: '短按窗口 (ms)', autoFireInterval: '连发间隔 (ms)', crouchWindow: '蹲起窗口', crouchWindowDesc: '松蹲后的稳定宽限与误差恢复', crouchGrace: '蹲起宽限 (ms)', crouchRecovery: '蹲起恢复 (ms)', maxSpeedHelp: '默认 1.0。人物最快能跑多快。整体偏大时，模型会觉得你跑得更快，更容易出现红柱。', accelerationHelp: '默认 5.5。按住方向键后，速度多快能加上去。偏大=刚起步就容易被判在动；偏小=起步偏慢，容易偏绿。', counterBrakeHelp: '默认 14。按反向键时，速度多快能刹到 0。AD 急停主要靠它；偏大=停得更狠、更容易绿；偏小=刹不住、容易红。', naturalDecelHelp: '默认 2.5。松开方向键后，惯性滑行多快能停下来。偏小=松键后还在滑，容易红。', accurateRatioHelp: '默认 0.34（CS2 约 34% 满速可准）。速度低于「最大移速 × 该比例」就算准。偏大=更宽松、容易绿；偏小=更严格、容易红。', firstShotHelp: '默认 18ms。按下鼠标后，过这么久才去量速度。软件比游戏判得早→加大；判得晚→减小。', tapHelp: '默认 90ms。点射按住不超过这么久，只记一发。偏短=连点各算一发；偏长=长按才开始连发采样。', autoFireHelp: '默认 100ms。按住连发时，每隔多久记一根柱子。只影响连发记录频率，不影响单点判定。', crouchGraceHelp: '默认 45ms。松蹲后这段时间内开枪，仍按稳定算。蹲起打法可酌情调大。', crouchRecoveryHelp: '默认 90ms。蹲起宽限过后，误差慢慢恢复正常的过渡时间。偏长=蹲后更久仍偏宽容。',
  },
};

const enUS: typeof zhCN = {
  common: {
    appName: 'CS Match Helper',
    chinese: 'Simplified Chinese',
    english: 'English',
    language: 'Language',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    back: 'Back',
    loading: 'Loading…',
    retry: 'Retry',
    unknown: 'Unknown',
    home: 'Home',
    settings: 'Settings',
    debug: 'Debug',
    exit: 'Exit',
    minimize: 'Minimize',
    maximize: 'Maximize',
    previous: 'Go back',
    newVersion: 'Update available',
    newVersionAria: 'A new version is available',
    confirmExit: 'Exit CS Match Helper?',
  },
  settings: {
    title: 'Settings',
    nav: 'Settings navigation',
    languageTitle: 'Display language',
    history: 'Match history',
    historyDesc: 'Review locally saved matches and AI analysis',
    ai: 'AI settings',
    aiDesc: 'API and model configuration',
    comments: 'My comments',
    commentsDesc: 'Review and manage comments you posted',
    changelog: 'Changelog',
    changelogDesc: 'Release history and feature notes',
    about: 'About',
    aboutDesc: 'Version and author information',
  },
  hud: {
    counterStrafing: 'Counter-strafing',
    shooting: 'Shooting stability',
    averageTiming: 'Avg. timing',
    successRate: 'Success rate',
    consistency: 'Consistency',
    tendency: 'Tendency',
    averageError: 'Avg. error',
    stableRate: 'Stable rate',
    perfect: 'Perfect',
    good: 'Good',
    early: 'Early',
    late: 'Late',
    drag: 'Move HUD',
    initError: 'Could not initialize the HUD',
    assessmentInitError: 'Could not initialize the counter-strafing HUD',
    error: 'Error',
    stable: 'Stable',
    average: 'Average',
    goodRate: 'Good rate',
    standardDeviation: 'Std. dev.',
    normal: 'Neutral',
  },
  aiErrors: {
    mapSupplementParse: 'Could not parse the map follow-up. Try again.',
    responseParse: 'Could not parse the AI response. Try again.',
    injectParse: 'Could not parse the AI result JSON. Check its format.',
  },
  aiUi: {
    closeData: 'The teams look evenly matched. Waiting for the AI assessment.', localLead: 'Local estimate: Team {side} has a slight statistical edge', needKey: 'Add an API key in Settings to enable AI analysis', disabled: 'AI analysis is disabled. Enable it in Settings.', calibrating: '{headline} AI is refining the assessment…', waiting: 'Waiting for AI analysis…', confidence: 'Data confidence {value}%', confidenceReason: 'Data confidence {value}% · {reason}', calculating: 'Calculating…', tokens: 'Input {input} · Output {output} · Total {total}', tokenBreakdown: 'Initial: {baseInput} in / {baseOutput} out · Map follow-up: {mapInput} in / {mapOutput} out', missingConfig: 'Required setup missing', fillKey: 'Add an', keyExplanation: 'AI analysis is enabled, but {label} is missing. Add it to use pre-match predictions and detailed analysis.', findKey: 'Find “{label}” in Settings and paste your key', noKey: 'Need a key?', getDeepSeekKey: 'Get a DeepSeek API key', providerKey: 'Get an OpenAI-compatible API key from your selected provider.', configureKey: 'Configure API key', notEnabled: 'AI analysis is disabled', enableDesc: 'Enable it to predict the likely winner and analyze both teams from their match data.', enable: 'Enable in Settings', incomplete: 'Analysis incomplete', noHistory: 'No pre-match analysis for this match', retryHistory: 'Generate it again and save the result to match history', generateHistory: 'Analyze the saved match data and add the result to history', generate: 'Generate analysis', stopAnalysis: 'Stop analysis', mapSupplement: 'Map confirmed. Adding map-specific analysis…', disclaimer: 'Pre-match estimate, not a match result', elapsed: 'Elapsed {value}', reanalyze: 'Analyze again', languageMismatch: 'Result is in another language', regenerateCurrentLanguage: 'Regenerate in current language', stop: 'Stop', highlights: 'Key factors', risks: 'Risks', waitingReturn: 'Waiting for the AI response…', noRisks: 'No significant risks identified', keyPlayers: 'Impact players', team: 'Team {side}',
  },
  home: {
    productName: 'Match Helper',
    navigation: 'Tools',
    open: 'Open {title}',
    matchTitle: 'Match Assistant',
    matchCategory: 'Pre-match analysis',
    matchDescription: 'Review both lineups and key stats before the match to make faster decisions.',
    matchAction: 'Open Match Assistant',
    counterTitle: 'Counter Strafing HUD',
    counterCategory: 'Aim training',
    counterDescription: 'Measure A / D release timing and build a consistent counter-strafe.',
    counterAction: 'Open Counter Strafing HUD',
  },
  platform: {
    title: 'Select a matchmaking platform',
    regionLabel: 'Chinese CS platform',
    hudLabel: 'Need the Counter Strafing HUD?',
    hudHint: 'Click the control to the right of the app title.',
    perfect: 'Perfect World Arena',
    perfectDesc: 'Match data is detected automatically',
    fiveE: '5E Arena',
    fiveEDesc: 'Launch 5E through CS Match Helper',
  },
  p5e: {
    checking: 'Checking your environment…', pathPrompt: 'Select or enter the 5E client path', restarting: 'Closing the running 5E client and relaunching…', launching: 'Launching 5E…', running: '5E is already running. Launching will close and restart it.', connected: 'Connected. Waiting for a match.', connectionError: 'Connection problem', clickLaunch: 'Use the button below to launch 5E', emptyPath: 'Enter the 5E client path', invalidPath: 'Select the folder containing 5EClient.exe', pickerTitle: 'Select 5EClient.exe', client: '5E client', externalDebug: 'An external 5E debugging connection is active. Fully exit 5E and try again.', changePlatform: 'Change platform', title: 'Launch 5E Arena', pathValid: 'Valid path', clientMissing: 'Client not found', pathLabel: 'Client path', pathPlaceholder: 'Folder containing 5EClient.exe', browse: 'Browse files', pathHelp: 'Enter or paste a path. Valid paths are saved automatically.', runningHelp: '5E is running. “Launch now” will try to close it automatically; follow the instructions below if that fails.', waking: 'Opening the client…', launchNow: 'Launch 5E',
  },
  counter: {
    title: 'Counter Strafing HUD', nav: 'Counter-strafing navigation', console: 'Console', data: 'Data', keys: 'Keybinds', advanced: 'Advanced', guide: 'Guide', consoleDesc: 'Choose a display mode, start recording, and finish setup', dataDesc: 'Summary stats, trends, and latest results for counter-strafing and shooting stability', guideDesc: 'How shooting stability, counter-strafing grades, and metrics work', keysDesc: 'Customize movement, crouch, and fire keys', advancedDesc: 'Movement model, sampling calibration, and grading thresholds', reset: 'Restore defaults', resetDesc: 'Keybinds, HUDs, and advanced parameters', restartSteps1: 'Fully exit CS Match Helper', restartSteps2: 'Find the app on your desktop or Start menu', restartSteps3: 'Right-click and select “Run as administrator”', restartSteps4: 'Return here and select “Start recording” again', restarting: 'Restarting…', restartAdmin: 'Restart as administrator', keyMap: 'Key mapping', keyMapDesc: 'Customize movement, crouch, and fire bindings', pressKey: 'Press a new key…', resetKeys: 'Restore WASD / Ctrl / Mouse 1', judgement: 'Grading and display', judgementDesc: 'Tune stability grading, counter-strafe assessment, and history windows', historyCount: 'History size', historyCountDesc: 'Shared by both charts and used for average error, stable rate, and standard deviation', recordsUnit: 'records', assessment: 'Counter-strafe assessment', assessmentDesc: 'Opposite-key timing and grades', horizontal: 'Horizontal counter-strafe', vertical: 'Vertical counter-strafe', perfect: 'Perfect', good: 'Good', validWindow: 'Valid window', assessmentHelp: 'Thresholds become progressively stricter; switches outside the valid window are ignored', shooting: 'Shooting stability', shootingDesc: 'Fully-stopped speed and error grading', lowSpeedWindow: 'Initial low-speed window', stableThreshold: 'Stable error threshold', shootingHelp: 'Default low-speed window: 180ms. Default error threshold: 0.35; lower values are stricter.', movementModel: 'Movement model', movementModelDesc: 'Tune acceleration, counter-strafe braking, and natural deceleration', maxSpeed: 'Maximum speed', acceleration: 'Acceleration (/s)', counterBrake: 'Counter-strafe braking (/s)', naturalDecel: 'Natural deceleration (/s)', accurateRatio: 'Accurate-speed ratio', resetMovement: 'Restore movement model defaults', fireSampling: 'Fire sampling calibration', fireSamplingDesc: 'Align sampling with CS2 shot timing', firstShotDelay: 'First-shot delay (ms)', tapWindow: 'Tap window (ms)', autoFireInterval: 'Automatic-fire interval (ms)', crouchWindow: 'Crouch-release window', crouchWindowDesc: 'Stability grace and error recovery after releasing crouch', crouchGrace: 'Crouch-release grace (ms)', crouchRecovery: 'Crouch recovery (ms)', maxSpeedHelp: 'Default 1.0. Higher values model faster movement and produce more red bars.', accelerationHelp: 'Default 5.5. Higher values reach movement speed sooner; lower values model a slower start.', counterBrakeHelp: 'Default 14. Controls how quickly an opposite key brakes movement to zero. Higher values make counter-strafing stop faster.', naturalDecelHelp: 'Default 2.5. Controls how quickly movement coasts to a stop after releasing a key.', accurateRatioHelp: 'Default 0.34, approximately CS2’s accurate-speed threshold. Lower values require a more complete stop.', firstShotHelp: 'Default 18ms. Delay between Mouse 1 and the sampled movement speed.', tapHelp: 'Default 90ms. A press shorter than this records one tap instead of automatic fire.', autoFireHelp: 'Default 100ms. Sampling interval while Mouse 1 is held; it does not affect tap grading.', crouchGraceHelp: 'Default 45ms. Shots inside this window after releasing crouch remain stable.', crouchRecoveryHelp: 'Default 90ms. Transition back to normal error after the crouch-release grace period.',
  },
};

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
  ['按键监听启动失败', 'Input capture could not start'],
  ['监听全局按键通常需要管理员权限', 'Global input capture normally requires administrator access'],
  ['请右键「CS 匹配助手」→「以管理员身份运行」后重试', 'Right-click CS Match Helper, select Run as administrator, and try again'],
  ['急停采集仅支持 Windows', 'Counter-strafe capture is only supported on Windows'],
  ['显示急停评估 HUD 失败', 'Could not show the counter-strafe HUD'],
  ['显示 HUD 失败', 'Could not show the HUD'],
  ['创建急停评估 HUD 窗口失败', 'Could not create the counter-strafe HUD window'],
  ['创建 HUD 窗口失败', 'Could not create the HUD window'],
  ['启动急停记录失败', 'Could not start counter-strafe recording'],
  ['停止急停记录失败', 'Could not stop counter-strafe recording'],
  ['指定的 5E 目录无效', 'The selected 5E directory is invalid'],
  ['未找到 5E 客户端，请手动选择安装目录', 'Could not find the 5E client. Select its install directory manually'],
  ['无法启动 5E', 'Could not launch 5E'],
  ['无法连接 CDP', 'Could not connect to CDP'],
  ['CDP 列表解析失败', 'Could not parse the CDP target list'],
  ['5E 进程已退出', 'The 5E process has exited'],
  ['下载 Widget 失败', 'Could not download the Widget'],
  ['获取 Widget 版本信息失败', 'Could not fetch Widget version information'],
  ['查询 Widget 状态失败', 'Could not query Widget status'],
  ['Widget 安装包校验失败', 'Widget package verification failed'],
  ['无法打开安装包', 'Could not open the package'],
  ['无法读取 zip 安装包（文件可能已损坏）', 'Could not read the zip package; the file may be corrupted'],
  ['安装任务失败', 'Widget setup task failed'],
  ['路径不存在', 'Path does not exist'],
  ['安装包不完整', 'The package is incomplete'],
  ['仅支持 .zip 安装包', 'Only .zip packages are supported'],
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
