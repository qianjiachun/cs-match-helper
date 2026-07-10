import type { P5eCdpEvent, P5eHttpEvent, P5eWsEvent, P5eWsFrameEvent } from './types';

export function isP5eHttpEvent(event: P5eCdpEvent): event is P5eHttpEvent {
  return event.kind === 'http';
}

export function isP5eWsEvent(event: P5eCdpEvent): event is P5eWsEvent {
  return event.kind === 'ws_open' || event.kind === 'ws_close' || event.kind === 'ws_frame';
}

export function isP5eWsFrameEvent(event: P5eCdpEvent): event is P5eWsFrameEvent {
  return event.kind === 'ws_frame';
}

export function summarizeWsEvent(event: P5eWsEvent): string {
  if (event.kind === 'ws_open') {
    return `WS 打开 · ${event.url} · req=${event.requestId}`;
  }
  if (event.kind === 'ws_close') {
    return `WS 关闭 · ${event.url} · req=${event.requestId}`;
  }
  const parts = [
    `WS 帧 · opcode=${event.opcode}`,
    event.eventHint ? `hint=${event.eventHint}` : null,
    event.parseError ? `err=${event.parseError}` : null,
    event.truncated ? 'truncated' : null,
    event.decodedText ? `text=${event.decodedText.length}B` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function formatWsEventDetail(event: P5eWsEvent): string {
  if (event.kind === 'ws_open' || event.kind === 'ws_close') {
    return JSON.stringify(event, null, 2);
  }
  return JSON.stringify(
    {
      requestId: event.requestId,
      url: event.url,
      capturedAt: event.capturedAt,
      opcode: event.opcode,
      eventHint: event.eventHint,
      parseError: event.parseError,
      truncated: event.truncated,
      payloadRaw: event.payloadRaw,
      decodedText: event.decodedText,
      decodedJson: event.decodedJson,
      innerBase64Text: event.innerBase64Text,
      innerJson: event.innerJson,
    },
    null,
    2,
  );
}
