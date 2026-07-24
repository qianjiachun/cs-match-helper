export interface AssessmentChartPoint {
  x: number;
  y: number;
}

export interface AssessmentBezierSegment {
  start: AssessmentChartPoint;
  control1: AssessmentChartPoint;
  control2: AssessmentChartPoint;
  end: AssessmentChartPoint;
}

function secant(a: AssessmentChartPoint, b: AssessmentChartPoint): number {
  const dx = b.x - a.x;
  return dx > 0 ? (b.y - a.y) / dx : 0;
}

function clamp(value: number, a: number, b: number): number {
  return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));
}

/** Monotone cubic tangents keep the curve inside each pair of adjacent samples. */
export function monotoneTangents(points: AssessmentChartPoint[]): number[] {
  if (points.length < 2) return points.map(() => 0);

  const slopes = points.slice(1).map((point, index) => secant(points[index], point));
  const tangents = new Array<number>(points.length).fill(0);
  tangents[0] = slopes[0];
  tangents[tangents.length - 1] = slopes[slopes.length - 1];

  for (let i = 1; i < points.length - 1; i += 1) {
    const previousSlope = slopes[i - 1];
    const nextSlope = slopes[i];
    if (previousSlope === 0 || nextSlope === 0 || previousSlope * nextSlope <= 0) {
      tangents[i] = 0;
      continue;
    }

    const previousWidth = points[i].x - points[i - 1].x;
    const nextWidth = points[i + 1].x - points[i].x;
    const weight1 = 2 * nextWidth + previousWidth;
    const weight2 = nextWidth + 2 * previousWidth;
    tangents[i] =
      (weight1 + weight2) /
      (weight1 / previousSlope + weight2 / nextSlope);
  }

  return tangents;
}

export function buildMonotoneBezierSegments(
  points: AssessmentChartPoint[],
): AssessmentBezierSegment[] {
  if (points.length < 2) return [];
  const tangents = monotoneTangents(points);

  return points.slice(1).map((end, index) => {
    const start = points[index];
    const width = end.x - start.x;
    const controlWidth = width / 3;

    return {
      start,
      control1: {
        x: start.x + controlWidth,
        y: clamp(start.y + tangents[index] * controlWidth, start.y, end.y),
      },
      control2: {
        x: end.x - controlWidth,
        y: clamp(end.y - tangents[index + 1] * controlWidth, start.y, end.y),
      },
      end,
    };
  });
}

function coordinate(value: number): string {
  return value.toFixed(1);
}

export function assessmentSegmentPaths(
  points: AssessmentChartPoint[],
): string[] {
  return buildMonotoneBezierSegments(points).map(
    ({ start, control1, control2, end }) =>
      `M ${coordinate(start.x)} ${coordinate(start.y)} C ${coordinate(control1.x)} ${coordinate(control1.y)} ${coordinate(control2.x)} ${coordinate(control2.y)} ${coordinate(end.x)} ${coordinate(end.y)}`,
  );
}
