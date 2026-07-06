import { type Ref, ref } from 'vue';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';

const COPY_GHOST_CLASS =
  'copy-steamid-ghost pointer-events-none absolute left-1/2 bottom-0 z-10 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-600 shadow-sm ring-1 ring-emerald-100';

export type CopySuccessAnimationRefs = {
  copyWrapRef: Ref<HTMLElement | null>;
  copyIconRef: Ref<HTMLElement | null>;
  copyCheckTemplateRef: Ref<HTMLElement | null>;
};

export function useCopySuccessAnimation(refs: CopySuccessAnimationRefs) {
  const { copyWrapRef, copyIconRef, copyCheckTemplateRef } = refs;
  const copyIconHighlighted = ref(false);

  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function playCopyIconPop() {
    const el = copyIconRef.value;
    if (!el) return;

    animate(el, {
      scale: [1, 1.15, 1],
      duration: 320,
      ease: 'outCubic',
    });
  }

  function flashCopyIcon() {
    copyIconHighlighted.value = true;
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copyIconHighlighted.value = false;
    }, 900);
  }

  function playCopySuccessAnimation() {
    const wrap = copyWrapRef.value;
    const source = copyCheckTemplateRef.value?.querySelector('svg');
    if (!wrap || !source) return;

    const ghost = document.createElement('span');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.className = COPY_GHOST_CLASS;
    ghost.innerHTML =
      '<span class="inline-flex h-3 w-3 items-center justify-center" aria-hidden="true"></span><span>已复制</span>';
    const iconSlot = ghost.querySelector('span');
    if (iconSlot) {
      iconSlot.appendChild(source.cloneNode(true));
    }
    wrap.appendChild(ghost);

    createTimeline()
      .add(ghost, {
        opacity: [0, 0.98],
        scale: [0.82, 1],
        duration: 160,
        ease: 'outCubic',
      })
      .add(ghost, {
        opacity: [0.98, 0],
        translateY: [0, -30],
        scale: [1, 0.88],
        duration: 760,
        ease: 'outQuart',
      })
      .then(() => {
        ghost.remove();
      });

    playCopyIconPop();
    flashCopyIcon();
  }

  return {
    copyIconHighlighted,
    playCopySuccessAnimation,
  };
}
