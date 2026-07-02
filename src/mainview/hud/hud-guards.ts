/** HUD 浮层禁止右键菜单与右键按下，避免 WebView 默认菜单或误关窗口 */
export function installHudGuards(): void {
  const blockSecondaryPointer = (event: MouseEvent) => {
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault();
    },
    { capture: true },
  );

  document.addEventListener('mousedown', blockSecondaryPointer, { capture: true });
  document.addEventListener('mouseup', blockSecondaryPointer, { capture: true });
  document.addEventListener('auxclick', blockSecondaryPointer, { capture: true });
}
