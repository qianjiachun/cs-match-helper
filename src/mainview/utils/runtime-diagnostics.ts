export type RuntimeDiagnostics = {
  userAgent: string;
  prefersReducedMotion: boolean;
  chromiumVersion: string | null;
  webview2Hint: string | null;
  cssAnimationSupported: boolean;
  cssColorMixSupported: boolean;
  cssBackdropFilterSupported: boolean;
};

function parseChromiumVersion(userAgent: string): string | null {
  const match = userAgent.match(/Chrom(?:e|ium)\/([\d.]+)/);
  return match?.[1] ?? null;
}

function parseWebView2Version(userAgent: string): string | null {
  const match = userAgent.match(/Edg\/([\d.]+)/);
  return match?.[1] ?? null;
}

export function collectRuntimeDiagnostics(): RuntimeDiagnostics {
  const userAgent = navigator.userAgent;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chromiumVersion = parseChromiumVersion(userAgent);
  const webview2Version = parseWebView2Version(userAgent);

  let cssAnimationSupported = true;
  let cssColorMixSupported = true;
  let cssBackdropFilterSupported = true;

  try {
    cssAnimationSupported = CSS.supports('animation', 'spin 1s linear infinite');
    cssColorMixSupported = CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
    cssBackdropFilterSupported =
      CSS.supports('backdrop-filter', 'blur(4px)') ||
      CSS.supports('-webkit-backdrop-filter', 'blur(4px)');
  } catch {
    cssAnimationSupported = false;
    cssColorMixSupported = false;
    cssBackdropFilterSupported = false;
  }

  return {
    userAgent,
    prefersReducedMotion,
    chromiumVersion,
    webview2Hint: webview2Version ? `Edge/WebView2 ${webview2Version}` : null,
    cssAnimationSupported,
    cssColorMixSupported,
    cssBackdropFilterSupported,
  };
}

export function formatRuntimeDiagnostics(info: RuntimeDiagnostics): string {
  const lines = [
    `User-Agent: ${info.userAgent}`,
    `系统减少动态效果: ${info.prefersReducedMotion ? '是（抽屉等动画会缩短）' : '否'}`,
    `Chromium: ${info.chromiumVersion ?? '未知'}`,
    `WebView2: ${info.webview2Hint ?? '未检测到 Edge 标识'}`,
    `CSS 动画: ${info.cssAnimationSupported ? '支持' : '不支持'}`,
    `CSS color-mix: ${info.cssColorMixSupported ? '支持' : '不支持'}`,
    `CSS backdrop-filter: ${info.cssBackdropFilterSupported ? '支持' : '不支持（遮罩将退化为纯色）'}`,
  ];
  return lines.join('\n');
}

export function logRuntimeDiagnostics(): RuntimeDiagnostics {
  const info = collectRuntimeDiagnostics();
  console.info('[CS匹配助手] 运行时诊断\n' + formatRuntimeDiagnostics(info));
  return info;
}
