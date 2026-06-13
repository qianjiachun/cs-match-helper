export type RuntimeDiagnostics = {
  userAgent: string;
  prefersReducedMotion: boolean;
  chromiumVersion: string | null;
  webview2Hint: string | null;
  cssAnimationSupported: boolean;
  cssColorMixSupported: boolean;
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

  try {
    cssAnimationSupported = CSS.supports('animation', 'spin 1s linear infinite');
    cssColorMixSupported = CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  } catch {
    cssAnimationSupported = false;
    cssColorMixSupported = false;
  }

  return {
    userAgent,
    prefersReducedMotion,
    chromiumVersion,
    webview2Hint: webview2Version ? `Edge/WebView2 ${webview2Version}` : null,
    cssAnimationSupported,
    cssColorMixSupported,
  };
}

export function formatRuntimeDiagnostics(info: RuntimeDiagnostics): string {
  const lines = [
    `User-Agent: ${info.userAgent}`,
    `系统减少动态效果: ${info.prefersReducedMotion ? '是（应用动画仍强制开启）' : '否'}`,
    `Chromium: ${info.chromiumVersion ?? '未知'}`,
    `WebView2: ${info.webview2Hint ?? '未检测到 Edge 标识'}`,
    `CSS 动画: ${info.cssAnimationSupported ? '支持' : '不支持'}`,
    `CSS color-mix: ${info.cssColorMixSupported ? '支持' : '不支持'}`,
  ];
  return lines.join('\n');
}

export function logRuntimeDiagnostics(): RuntimeDiagnostics {
  const info = collectRuntimeDiagnostics();
  console.info('[CS匹配助手] 运行时诊断\n' + formatRuntimeDiagnostics(info));
  return info;
}
