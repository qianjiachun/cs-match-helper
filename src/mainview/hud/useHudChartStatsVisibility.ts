import { onMounted, onUnmounted, ref, type Ref } from 'vue';

export type ShootingHudStatsVisibility = {
  showBar: boolean;
  showError: boolean;
  showStable: boolean;
};

export type AssessmentHudStatsVisibility = {
  showBar: boolean;
  showAvg: boolean;
  showSuccess: boolean;
  showStdDev: boolean;
  showTendency: boolean;
};

export function shootingHudStatsVisibility(
  width: number,
  height: number,
): ShootingHudStatsVisibility {
  if (width < 96 || height < 42) {
    return { showBar: false, showError: false, showStable: false };
  }
  if (width < 148) {
    return { showBar: true, showError: true, showStable: false };
  }
  return { showBar: true, showError: true, showStable: true };
}

export function assessmentHudStatsVisibility(
  width: number,
  height: number,
): AssessmentHudStatsVisibility {
  if (width < 108 || height < 46) {
    return {
      showBar: false,
      showAvg: false,
      showSuccess: false,
      showStdDev: false,
      showTendency: false,
    };
  }
  if (width < 176) {
    return {
      showBar: true,
      showAvg: true,
      showSuccess: false,
      showStdDev: false,
      showTendency: false,
    };
  }
  if (width < 236) {
    return {
      showBar: true,
      showAvg: true,
      showSuccess: true,
      showStdDev: false,
      showTendency: false,
    };
  }
  if (width < 296) {
    return {
      showBar: true,
      showAvg: true,
      showSuccess: true,
      showStdDev: true,
      showTendency: false,
    };
  }
  return {
    showBar: true,
    showAvg: true,
    showSuccess: true,
    showStdDev: true,
    showTendency: true,
  };
}

export function useHudChartStatsVisibility<T>(
  rootRef: Ref<HTMLElement | null>,
  compute: (width: number, height: number) => T,
) {
  const visibility = ref(compute(0, 0)) as Ref<T>;
  let resizeObserver: ResizeObserver | null = null;

  const update = (width: number, height: number) => {
    visibility.value = compute(width, height);
  };

  onMounted(() => {
    const el = rootRef.value;
    if (!el) return;

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        update(width, height);
      }
    });
    resizeObserver.observe(el);
    update(el.clientWidth, el.clientHeight);
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
  });

  return visibility;
}
