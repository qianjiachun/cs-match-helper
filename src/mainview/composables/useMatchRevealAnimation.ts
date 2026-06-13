import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import { stagger } from 'animejs/utils';
import { nextTick, onMounted, onUnmounted, type Ref } from 'vue';

const REVEAL_SELECTOR = '[data-match-reveal]';
const PROGRESS_SELECTOR = '[data-match-reveal="progress"]';
const PROGRESS_HIDDEN_CLASS = 'match-reveal-progress--hidden';

function getProgressBar(root: HTMLElement) {
  return root.querySelector<HTMLElement>(PROGRESS_SELECTOR);
}

function hideProgressBar(root: HTMLElement) {
  const progress = getProgressBar(root);
  if (!progress) return;
  progress.classList.add(PROGRESS_HIDDEN_CLASS);
  progress.style.opacity = '';
  progress.style.width = '';
  progress.style.transition = '';
}

function showProgressBar(root: HTMLElement) {
  const progress = getProgressBar(root);
  if (!progress) return;
  progress.classList.remove(PROGRESS_HIDDEN_CLASS);
}

function clearRevealInlineStyles(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
    if (el.dataset.matchReveal === 'progress') return;
    el.style.opacity = '';
    el.style.transform = '';
    el.style.width = '';
    el.style.filter = '';
  });
  root.style.opacity = '';
  root.style.transform = '';
  root.style.filter = '';
}

function primeRevealTargets(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
    const kind = el.dataset.matchReveal;
    if (kind === 'progress') {
      el.style.width = '0%';
      el.style.opacity = '1';
      return;
    }
    el.style.opacity = '0';
    if (kind === 'header') {
      el.style.transform = 'translateY(-16px)';
    } else if (kind === 'meta') {
      el.style.transform = 'translateX(-12px)';
    } else if (kind === 'tabs') {
      el.style.transform = 'scale(0.96)';
    } else if (kind === 'team') {
      el.style.transform = 'translateY(12px)';
    } else if (kind === 'row') {
      el.style.transform = 'translateX(-6px)';
    } else if (kind === 'compare') {
      el.style.transform = 'translateY(20px)';
    } else {
      el.style.transform = 'translateY(16px)';
    }
  });
}

function runEnterTimeline(root: HTMLElement) {
  const progress = root.querySelector<HTMLElement>('[data-match-reveal="progress"]');
  const shell = root.querySelector<HTMLElement>('[data-match-reveal="shell"]');
  const header = root.querySelector<HTMLElement>('[data-match-reveal="header"]');
  const metaItems = root.querySelectorAll<HTMLElement>('[data-match-reveal="meta"]');
  const tabs = root.querySelector<HTMLElement>('[data-match-reveal="tabs"]');
  const teams = root.querySelectorAll<HTMLElement>('[data-match-reveal="team"]');
  const rows = root.querySelectorAll<HTMLElement>('[data-match-reveal="row"]');
  const compareBlocks = root.querySelectorAll<HTMLElement>('[data-match-reveal="compare"]');

  const tl = createTimeline({
    defaults: { ease: 'outExpo' },
  });

  if (progress) {
    tl.add(progress, {
      width: { from: '0%', to: '100%' },
      duration: 420,
      ease: 'inOutCubic',
    });
  }

  if (shell) {
    tl.add(
      shell,
      {
        opacity: { from: 0, to: 1 },
        translateY: { from: 8, to: 0 },
        duration: 300,
      },
      progress ? '-=340' : 0,
    );
  }

  if (header) {
    tl.add(
      header,
      {
        opacity: { from: 0, to: 1 },
        translateY: { from: -10, to: 0 },
        duration: 320,
      },
      '-=260',
    );
  }

  if (metaItems.length) {
    tl.add(
      metaItems,
      {
        opacity: { from: 0, to: 1 },
        translateX: { from: -8, to: 0 },
        duration: 260,
        delay: stagger(28),
      },
      '-=240',
    );
  }

  if (tabs) {
    tl.add(
      tabs,
      {
        opacity: { from: 0, to: 1 },
        scale: { from: 0.97, to: 1 },
        duration: 260,
      },
      '-=220',
    );
  }

  if (teams.length) {
    tl.add(
      teams,
      {
        opacity: { from: 0, to: 1 },
        translateY: { from: 12, to: 0 },
        duration: 340,
        delay: stagger(40),
      },
      '-=200',
    );
  }

  if (rows.length) {
    tl.add(
      rows,
      {
        opacity: { from: 0, to: 1 },
        translateX: { from: -6, to: 0 },
        duration: 200,
        delay: stagger(10, { from: 'first' }),
      },
      teams.length ? '-=280' : '-=180',
    );
  }

  if (compareBlocks.length) {
    tl.add(
      compareBlocks,
      {
        opacity: { from: 0, to: 1 },
        translateY: { from: 12, to: 0 },
        duration: 340,
        delay: stagger(45),
      },
      teams.length ? '-=240' : '-=200',
    );
  }

  return tl;
}

export function useMatchRevealAnimation(rootRef: Ref<HTMLElement | null>) {
  let activeTimeline: ReturnType<typeof createTimeline> | null = null;
  let exitAnimation: ReturnType<typeof animate> | null = null;
  let hasRevealedOnce = false;

  async function waitForPaint() {
    await nextTick();
    await nextTick();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function playReveal() {
    await waitForPaint();

    const root = rootRef.value;
    if (!root) return;

    activeTimeline?.pause();
    activeTimeline = null;
    exitAnimation?.pause();
    exitAnimation = null;

    if (hasRevealedOnce) {
      exitAnimation = animate(root, {
        opacity: { to: 0.6, duration: 140, ease: 'inQuad' },
        scale: { to: 0.992, duration: 140, ease: 'inQuad' },
        filter: { to: 'blur(1px)', duration: 140, ease: 'inQuad' },
      });
      await exitAnimation.then();
    }

    root.classList.add('match-panel--pending');
    root.classList.remove('match-panel--revealed');
    clearRevealInlineStyles(root);
    showProgressBar(root);
    primeRevealTargets(root);

    const tl = runEnterTimeline(root);
    activeTimeline = tl;

    void tl.then(() => {
      hasRevealedOnce = true;
      root.classList.remove('match-panel--pending');
      root.classList.add('match-panel--revealed');
      clearRevealInlineStyles(root);

      const progress = getProgressBar(root);
      if (progress) {
        progress.style.transition = 'opacity 240ms ease';
        progress.style.opacity = '0';
        window.setTimeout(() => hideProgressBar(root), 260);
      } else {
        hideProgressBar(root);
      }
    });
  }

  onMounted(() => {
    void playReveal();
  });

  onUnmounted(() => {
    activeTimeline?.pause();
    exitAnimation?.pause();
    activeTimeline = null;
    exitAnimation = null;
  });

  return { playReveal };
}
