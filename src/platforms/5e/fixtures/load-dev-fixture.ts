import type { P5eApiPayload } from '../types';
import fixture from './5e-match-success.fixture.json';

export interface P5eDevFixture {
  events: Record<string, P5eApiPayload>;
  matchCode?: string;
}

/** 仅由开发环境动态 import，勿在生产代码中静态引用 */
export function loadP5eDevFixture(): P5eDevFixture {
  return fixture as P5eDevFixture;
}
