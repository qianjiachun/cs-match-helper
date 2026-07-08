<script setup lang="ts">
import { marked } from 'marked';
import { computed } from 'vue';
import { openExternalUrl } from '../native';

const props = defineProps<{
  content: string;
}>();

marked.setOptions({
  breaks: true,
  gfm: true,
});

function normalizeReleaseNotes(content: string): string {
  return content
    .trim()
    .replace(/^#{1,2}\s*更新内容\s*\n+/i, '')
    .replace(/^---\s*\n+[\s\S]*$/m, '')
    .trim();
}

function wrapListItemContent(html: string): string {
  return html.replace(/<li>([\s\S]*?)<\/li>/g, (_, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed || trimmed.startsWith('<span class="release-note-li-text"')) return `<li>${inner}</li>`;
    return `<li><span class="release-note-li-text">${trimmed}</span></li>`;
  });
}

const html = computed(() => {
  const normalized = normalizeReleaseNotes(props.content);
  if (!normalized) return '';
  const parsed = marked.parse(normalized) as string;
  return wrapListItemContent(parsed);
});

function onContentClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement | null)?.closest('a');
  if (!anchor?.href) return;
  event.preventDefault();
  void openExternalUrl(anchor.href);
}
</script>

<template>
  <div
    v-if="html"
    class="release-notes selectable text-[13px] leading-6 text-fg-secondary"
    v-html="html"
    @click="onContentClick"
  />
</template>

<style scoped>
.release-notes :deep(h1),
.release-notes :deep(h2),
.release-notes :deep(h3),
.release-notes :deep(h4) {
  color: var(--color-fg);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.4;
  margin: 0 0 0.625rem;
}

.release-notes :deep(h1:not(:first-child)),
.release-notes :deep(h2:not(:first-child)),
.release-notes :deep(h3:not(:first-child)),
.release-notes :deep(h4:not(:first-child)) {
  margin-top: 1rem;
}

.release-notes :deep(p) {
  margin: 0 0 0.75rem;
}

.release-notes :deep(p:last-child) {
  margin-bottom: 0;
}

.release-notes :deep(ul),
.release-notes :deep(ol) {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.release-notes :deep(ul > li),
.release-notes :deep(ol > li) {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.75rem;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.92), rgb(250 250 250 / 0.88));
  padding: 0.625rem 0.75rem;
  line-height: 1.625;
  word-break: keep-all;
  overflow-wrap: anywhere;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.release-notes :deep(ul > li:hover),
.release-notes :deep(ol > li:hover) {
  border-color: color-mix(in srgb, var(--color-accent) 24%, var(--color-border));
  box-shadow: 0 1px 0 rgb(74 144 226 / 0.06);
}

.release-notes :deep(ul > li::before) {
  flex: none;
  align-self: center;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-accent) 16%, white);
  box-shadow: inset 0 0 0 2px var(--color-accent);
  content: '';
}

.release-notes :deep(.release-note-li-text) {
  min-width: 0;
  flex: 1;
}

.release-notes :deep(ol) {
  counter-reset: release-note;
}

.release-notes :deep(ol > li) {
  counter-increment: release-note;
}

.release-notes :deep(ol > li::before) {
  flex: none;
  align-self: center;
  display: inline-flex;
  width: 1.125rem;
  height: 1.125rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-accent) 12%, white);
  color: var(--color-accent);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  content: counter(release-note);
}

.release-notes :deep(strong) {
  color: var(--color-fg);
  font-weight: 600;
  white-space: nowrap;
}

.release-notes :deep(a) {
  color: var(--color-accent);
  cursor: pointer;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.2s ease;
}

.release-notes :deep(a:hover) {
  color: var(--color-accent-hover);
  text-decoration: underline;
}

.release-notes :deep(code) {
  border-radius: 0.25rem;
  background: var(--color-muted);
  padding: 0.1rem 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  color: var(--color-fg);
}

.release-notes :deep(pre) {
  margin: 0 0 0.75rem;
  overflow-x: auto;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-base);
  padding: 0.75rem;
}

.release-notes :deep(pre code) {
  background: transparent;
  padding: 0;
}

.release-notes :deep(hr) {
  margin: 0.875rem 0;
  border: 0;
  border-top: 1px solid var(--color-border);
}

.release-notes :deep(blockquote) {
  margin: 0 0 0.75rem;
  border-left: 3px solid var(--color-accent-muted);
  border-radius: 0 0.5rem 0.5rem 0;
  background: var(--color-elevated);
  padding: 0.625rem 0.75rem;
  color: var(--color-fg-muted);
}
</style>
