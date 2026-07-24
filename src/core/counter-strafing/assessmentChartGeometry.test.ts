import { describe, expect, it } from 'vitest';
import {
  assessmentSegmentPaths,
  buildMonotoneBezierSegments,
  monotoneTangents,
  type AssessmentChartPoint,
} from './assessmentChartGeometry';

function points(values: number[]): AssessmentChartPoint[] {
  return values.map((y, x) => ({ x: x * 10, y }));
}

describe('assessment chart geometry', () => {
  it('空数据和单点不生成连线', () => {
    expect(assessmentSegmentPaths([])).toEqual([]);
    expect(assessmentSegmentPaths(points([4]))).toEqual([]);
  });

  it('折线固定生成平滑曲线路径', () => {
    expect(assessmentSegmentPaths(points([0, 10]))).toEqual([
      'M 0.0 0.0 C 3.3 3.3 6.7 6.7 10.0 10.0',
    ]);
  });

  it.each([
    [0, 5, 10, 20],
    [20, 10, 5, 0],
    [0, 20, -20, 10],
    [0, 100, -100, 100],
  ])('平滑控制点不越过相邻样本范围 %#', (...values: number[]) => {
    for (const segment of buildMonotoneBezierSegments(points(values))) {
      const min = Math.min(segment.start.y, segment.end.y);
      const max = Math.max(segment.start.y, segment.end.y);
      expect(segment.control1.y).toBeGreaterThanOrEqual(min);
      expect(segment.control1.y).toBeLessThanOrEqual(max);
      expect(segment.control2.y).toBeGreaterThanOrEqual(min);
      expect(segment.control2.y).toBeLessThanOrEqual(max);
    }
  });

  it('趋势反转处使用水平切线', () => {
    expect(monotoneTangents(points([0, 10, 0]))[1]).toBe(0);
  });
});
