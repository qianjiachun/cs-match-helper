<script setup lang="ts">
/**
 * Counter-strafe preview — colors from business:
 * SHOT: stable #4ade80 / micro #fbbf24 / run #f87171 (+ crouch #5eead4)
 * TIMING line: perfect #5eead4 / success #4ade80 / early #fbbf24 / late #f87171
 * A/D presses ×4. Charts use their own calm reveal rhythm.
 */
</script>

<template>
  <svg
    class="home-svg home-svg--strafe h-full w-full"
    viewBox="0 0 320 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="sBg" x1="0" y1="0" x2="320" y2="200" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FAFBFC" />
        <stop offset="1" stop-color="#F1F5F9" />
      </linearGradient>
      <!-- Line gradient follows assessment quality along A→D→A→D -->
      <linearGradient id="sLineBiz" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#5eead4" />
        <stop offset="28%" stop-color="#4ade80" />
        <stop offset="55%" stop-color="#fbbf24" />
        <stop offset="78%" stop-color="#f87171" />
        <stop offset="100%" stop-color="#4ade80" />
      </linearGradient>
      <clipPath id="sTimingClip">
        <rect x="7" y="25" width="112" height="48" rx="5" />
      </clipPath>
    </defs>

    <rect width="320" height="200" rx="12" fill="url(#sBg)" />
    <rect x="14" y="12" width="292" height="176" rx="12" fill="#FFF" stroke="#E4E4E7" />

    <!-- A / D -->
    <g transform="translate(24 20)">
      <g class="s-key s-key--a">
        <rect class="s-key__pad" width="44" height="36" rx="8" />
        <text class="s-key__label" x="22" y="25" text-anchor="middle" font-size="14" font-family="Segoe UI,sans-serif" font-weight="800">A</text>
      </g>
      <g class="s-key s-key--d" transform="translate(54 0)">
        <rect class="s-key__pad" width="44" height="36" rx="8" />
        <text class="s-key__label" x="22" y="25" text-anchor="middle" font-size="14" font-family="Segoe UI,sans-serif" font-weight="800">D</text>
      </g>
      <path class="s-arrow" d="M104 18 H130" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" />
      <path class="s-arrow" d="M124 12 L132 18 L124 24" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <text x="168" y="23" fill="#8B919A" font-size="9" font-family="Segoe UI,sans-serif" font-weight="700">A / D TIMING</text>
    </g>

    <!-- SHOT bars: business shooting colors -->
    <g transform="translate(24 70)">
      <rect width="132" height="102" rx="8" fill="#FAFAFC" stroke="#ECECF0" />
      <text x="10" y="16" fill="#A1A1AA" font-size="8" font-family="Segoe UI,sans-serif" font-weight="600">SHOT</text>
      <g transform="translate(14 28)">
        <!-- stable / micro / run / crouchGrace pattern -->
        <rect class="s-col s-col--0" x="0" y="18" width="12" height="42" rx="2.5" fill="#4ade80" />
        <rect class="s-col s-col--1" x="18" y="30" width="12" height="30" rx="2.5" fill="#fbbf24" />
        <rect class="s-col s-col--2" x="36" y="10" width="12" height="50" rx="2.5" fill="#4ade80" />
        <rect class="s-col s-col--3" x="54" y="36" width="12" height="24" rx="2.5" fill="#f87171" />
        <rect class="s-col s-col--4" x="72" y="14" width="12" height="46" rx="2.5" fill="#5eead4" />
        <rect class="s-col s-col--5" x="90" y="26" width="12" height="34" rx="2.5" fill="#fbbf24" />
      </g>
    </g>

    <!-- TIMING line: a continuous, independent reveal -->
    <g transform="translate(168 70)">
      <rect width="124" height="102" rx="8" fill="#FAFAFC" stroke="#ECECF0" />
      <text x="10" y="16" fill="#A1A1AA" font-size="8" font-family="Segoe UI,sans-serif" font-weight="600">TIMING</text>
      <rect x="10" y="46" width="104" height="12" rx="4" fill="#ECFDF5" opacity="0.85" />
      <path d="M10 52 H114" stroke="#A7F3D0" stroke-width="1" stroke-dasharray="3 3" />
      <g clip-path="url(#sTimingClip)">
        <path
          id="sTimingPath"
          class="s-path"
          pathLength="1"
          d="M10 62 C18 62, 22 34, 30 34 S42 70, 50 52 S62 28, 70 40 S82 68, 90 50 S102 32, 114 44"
          stroke="url(#sLineBiz)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
        <circle class="s-target" cx="70" cy="40" r="5" fill="none" stroke="#4ADE80" stroke-width="1.5" />
        <circle class="s-playhead-motion" cx="0" cy="0" r="3.5" fill="#FFFFFF" stroke="#3B7DD8" stroke-width="2" opacity="0">
          <animateMotion
            dur="4.8s"
            repeatCount="indefinite"
            keyPoints="0;0;1;1"
            keyTimes="0;0.1;0.82;1"
            calcMode="linear"
          >
            <mpath href="#sTimingPath" />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;0;1;1;0;0"
            keyTimes="0;0.1;0.16;0.82;0.94;1"
            dur="4.8s"
            repeatCount="indefinite"
          />
        </circle>
        <circle class="s-playhead-static" cx="114" cy="44" r="3.5" fill="#FFFFFF" stroke="#3B7DD8" stroke-width="2" />
      </g>
      <text x="14" y="90" fill="#94A3B8" font-size="8" font-family="Segoe UI,sans-serif" font-weight="700">A</text>
      <text x="56" y="90" fill="#94A3B8" font-size="8" font-family="Segoe UI,sans-serif" font-weight="700">D</text>
      <text x="78" y="90" fill="#94A3B8" font-size="8" font-family="Segoe UI,sans-serif" font-weight="700">A</text>
      <text x="104" y="90" fill="#94A3B8" font-size="8" font-family="Segoe UI,sans-serif" font-weight="700">D</text>
    </g>
  </svg>
</template>

<style scoped>
.s-key__pad {
  fill: #f4f4f5;
  stroke: #d4d4d8;
  stroke-width: 1.5;
  transform-box: fill-box;
  transform-origin: center bottom;
}
.s-key__label {
  fill: #52525b;
}
.s-key--a .s-key__pad {
  animation: keyAPad 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.s-key--a .s-key__label {
  animation: keyALabel 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.s-key--d .s-key__pad {
  animation: keyDPad 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.s-key--d .s-key__label {
  animation: keyDLabel 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.s-arrow {
  transform-box: fill-box;
  transform-origin: center;
  animation: arrowFlash 4.8s ease-in-out infinite;
}

.s-col {
  transform-box: fill-box;
  transform-origin: bottom center;
  opacity: 0;
  transform: scaleY(0.08);
  animation: colReveal 4.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
.s-col--0 {
  animation-delay: 0.18s;
}
.s-col--1 {
  animation-delay: 0.36s;
}
.s-col--2 {
  animation-delay: 0.54s;
}
.s-col--3 {
  animation-delay: 0.72s;
}
.s-col--4 {
  animation-delay: 0.9s;
}
.s-col--5 {
  animation-delay: 1.08s;
}

.s-path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  opacity: 0;
  animation: pathReveal 4.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.s-target {
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
  animation: targetPulse 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.s-playhead-static {
  display: none;
}

@keyframes keyAPad {
  /* idle */
  0%,
  6% {
    fill: #f4f4f5;
    stroke: #d4d4d8;
    transform: translateY(0);
  }
  /* A1 */
  8%,
  18% {
    fill: #4ade80;
    stroke: #22c55e;
    transform: translateY(2px);
  }
  22%,
  46% {
    fill: #f4f4f5;
    stroke: #d4d4d8;
    transform: translateY(0);
  }
  /* A2 */
  48%,
  58% {
    fill: #4ade80;
    stroke: #22c55e;
    transform: translateY(2px);
  }
  62%,
  100% {
    fill: #f4f4f5;
    stroke: #d4d4d8;
    transform: translateY(0);
  }
}
@keyframes keyALabel {
  0%,
  6%,
  22%,
  46%,
  62%,
  100% {
    fill: #52525b;
  }
  8%,
  18%,
  48%,
  58% {
    fill: #fff;
  }
}
@keyframes keyDPad {
  0%,
  26% {
    fill: #f4f4f5;
    stroke: #d4d4d8;
    transform: translateY(0);
  }
  /* D1 — perfect teal */
  28%,
  38% {
    fill: #5eead4;
    stroke: #2dd4bf;
    transform: translateY(2px);
  }
  42%,
  66% {
    fill: #f4f4f5;
    stroke: #d4d4d8;
    transform: translateY(0);
  }
  /* D2 */
  68%,
  78% {
    fill: #5eead4;
    stroke: #2dd4bf;
    transform: translateY(2px);
  }
  82%,
  100% {
    fill: #f4f4f5;
    stroke: #d4d4d8;
    transform: translateY(0);
  }
}
@keyframes keyDLabel {
  0%,
  26%,
  42%,
  66%,
  82%,
  100% {
    fill: #52525b;
  }
  28%,
  38%,
  68%,
  78% {
    fill: #fff;
  }
}
@keyframes arrowFlash {
  0%,
  7%,
  21%,
  47%,
  61%,
  81%,
  100% {
    opacity: 0.2;
    transform: translateX(0);
  }
  10%,
  16%,
  30%,
  36%,
  50%,
  56%,
  70%,
  76% {
    opacity: 1;
    transform: translateX(2px);
  }
}

@keyframes targetPulse {
  0%,
  38% {
    opacity: 0;
    transform: scale(0.45);
  }
  48% {
    opacity: 0.8;
    transform: scale(1);
  }
  62%,
  100% {
    opacity: 0;
    transform: scale(1.75);
  }
}

@keyframes pathReveal {
  0%,
  8% {
    stroke-dashoffset: 1;
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  42%,
  82% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  94%,
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}

@keyframes colReveal {
  0%,
  5% {
    transform: scaleY(0.08);
    opacity: 0;
  }
  24%,
  80% {
    transform: scaleY(1);
    opacity: 1;
  }
  92%,
  100% {
    transform: scaleY(1);
    opacity: 0;
  }
}

</style>
