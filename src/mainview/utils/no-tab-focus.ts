const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function makeUnfocusable(el: Element) {
  if (el instanceof HTMLElement) {
    el.tabIndex = -1;
  }
}

function stripTabFocus(root: ParentNode) {
  if (root instanceof Element && root.matches(FOCUSABLE_SELECTOR)) {
    makeUnfocusable(root);
  }
  root.querySelectorAll(FOCUSABLE_SELECTOR).forEach(makeUnfocusable);
}

/** 禁止 Tab 键在页面内切换焦点 */
export function installNoTabFocus() {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') e.preventDefault();
    },
    { capture: true },
  );

  stripTabFocus(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof Element) stripTabFocus(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
