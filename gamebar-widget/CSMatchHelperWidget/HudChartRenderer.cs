using System;
using System.Collections.Generic;
using Windows.Data.Json;
using Windows.UI;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Shapes;

namespace CSMatchHelperWidget
{
    internal sealed class AssessmentChartRenderer
    {
        private const double DiffClampMs = 100;
        private const int MaxPoints = 32;
        private const int MaxSegments = MaxPoints - 1;

        private readonly Canvas _canvas;
        private readonly Line _baseline;
        private readonly Line[] _segments;
        private readonly Ellipse[] _dots;
        private readonly SolidColorBrush[] _segmentBrushes;
        private readonly SolidColorBrush[] _dotBrushes;
        private readonly SolidColorBrush _baselineBrush;

        public AssessmentChartRenderer(Canvas canvas)
        {
            _canvas = canvas;
            _baselineBrush = new SolidColorBrush(Color.FromArgb(0x2E, 0xFF, 0xFF, 0xFF));
            _baseline = CreateDashedLine(_baselineBrush);
            _segments = new Line[MaxSegments];
            _segmentBrushes = new SolidColorBrush[MaxSegments];
            _dots = new Ellipse[MaxPoints];
            _dotBrushes = new SolidColorBrush[MaxPoints];

            _canvas.Children.Add(_baseline);

            for (var i = 0; i < MaxSegments; i++)
            {
                var brush = new SolidColorBrush(Colors.Transparent);
                _segmentBrushes[i] = brush;
                var line = new Line
                {
                    Stroke = brush,
                    StrokeThickness = 1.25,
                    StrokeLineJoin = PenLineJoin.Round,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Opacity = 0.9,
                    Visibility = Visibility.Collapsed,
                };
                _segments[i] = line;
                _canvas.Children.Add(line);
            }

            for (var i = 0; i < MaxPoints; i++)
            {
                var brush = new SolidColorBrush(Colors.Transparent);
                _dotBrushes[i] = brush;
                var dot = new Ellipse
                {
                    Fill = brush,
                    Visibility = Visibility.Collapsed,
                };
                _dots[i] = dot;
                _canvas.Children.Add(dot);
            }
        }

        public void Reset()
        {
            _baseline.Visibility = Visibility.Collapsed;
            for (var i = 0; i < MaxSegments; i++)
            {
                _segments[i].Visibility = Visibility.Collapsed;
            }

            for (var i = 0; i < MaxPoints; i++)
            {
                _dots[i].Visibility = Visibility.Collapsed;
            }
        }

        public void Update(JsonArray records)
        {
            var width = _canvas.ActualWidth;
            var height = _canvas.ActualHeight;
            if (width <= 0 || height <= 0)
            {
                return;
            }

            var data = SliceLast(records, MaxPoints);
            if (data.Count == 0)
            {
                Reset();
                return;
            }

            const double padX = 2;
            const double padY = 2;
            var innerW = width - padX * 2;
            var innerH = height - padY * 2;
            var zeroY = padY + innerH / 2;

            _baseline.X1 = padX;
            _baseline.Y1 = zeroY;
            _baseline.X2 = width - padX;
            _baseline.Y2 = zeroY;
            _baseline.Visibility = Visibility.Visible;

            var dots = new List<(double x, double y, Color color, bool isLatest)>(data.Count);
            for (var i = 0; i < data.Count; i++)
            {
                if (data[i].ValueType != JsonValueType.Object)
                {
                    continue;
                }

                var record = data[i].GetObject();
                var diffMs = JsonHelpers.GetNumber(record, "diffMs");
                var x = padX + (data.Count == 1 ? innerW / 2 : (i / (double)(data.Count - 1)) * innerW);
                var clamped = Math.Max(-DiffClampMs, Math.Min(DiffClampMs, diffMs));
                var y = zeroY - (clamped / DiffClampMs) * (innerH / 2 - 4);
                dots.Add((x, y, HudChartRenderer.AssessmentRecordColor(record), i == data.Count - 1));
            }

            var segmentCount = Math.Max(0, dots.Count - 1);
            for (var i = 0; i < MaxSegments; i++)
            {
                if (i < segmentCount)
                {
                    var start = dots[i];
                    var end = dots[i + 1];
                    _segments[i].X1 = start.x;
                    _segments[i].Y1 = start.y;
                    _segments[i].X2 = end.x;
                    _segments[i].Y2 = end.y;
                    _segmentBrushes[i].Color = end.color;
                    _segments[i].Visibility = Visibility.Visible;
                }
                else
                {
                    _segments[i].Visibility = Visibility.Collapsed;
                }
            }

            for (var i = 0; i < MaxPoints; i++)
            {
                if (i < dots.Count)
                {
                    var dot = dots[i];
                    var radius = dot.isLatest ? 2.0 : dots.Count > 24 ? 1.0 : dots.Count > 16 ? 1.25 : 1.5;
                    _dots[i].Width = radius * 2;
                    _dots[i].Height = radius * 2;
                    _dotBrushes[i].Color = dot.color;
                    _dots[i].Opacity = dot.isLatest ? 1 : 0.85;
                    Canvas.SetLeft(_dots[i], dot.x - radius);
                    Canvas.SetTop(_dots[i], dot.y - radius);
                    _dots[i].Visibility = Visibility.Visible;
                }
                else
                {
                    _dots[i].Visibility = Visibility.Collapsed;
                }
            }
        }

        private static Line CreateDashedLine(SolidColorBrush brush)
        {
            return new Line
            {
                Stroke = brush,
                StrokeThickness = 1,
                StrokeDashArray = new DoubleCollection { 3, 4 },
                Visibility = Visibility.Collapsed,
            };
        }

        private static List<IJsonValue> SliceLast(JsonArray array, int maxPoints)
        {
            var result = new List<IJsonValue>();
            var start = Math.Max(0, (int)array.Count - maxPoints);
            for (var i = start; i < array.Count; i++)
            {
                result.Add(array[i]);
            }

            return result;
        }
    }

    internal sealed class ShootingChartRenderer
    {
        private const int MaxPoints = 32;

        private readonly Canvas _canvas;
        private readonly Rectangle[] _bars;
        private readonly SolidColorBrush[] _barBrushes;

        public ShootingChartRenderer(Canvas canvas)
        {
            _canvas = canvas;
            _bars = new Rectangle[MaxPoints];
            _barBrushes = new SolidColorBrush[MaxPoints];

            for (var i = 0; i < MaxPoints; i++)
            {
                var brush = new SolidColorBrush(Colors.Transparent);
                _barBrushes[i] = brush;
                var bar = new Rectangle
                {
                    RadiusX = 1,
                    RadiusY = 1,
                    Fill = brush,
                    Visibility = Visibility.Collapsed,
                };
                _bars[i] = bar;
                _canvas.Children.Add(bar);
            }
        }

        public void Reset()
        {
            for (var i = 0; i < MaxPoints; i++)
            {
                _bars[i].Visibility = Visibility.Collapsed;
            }
        }

        public void Update(JsonArray records, bool showStableBars)
        {
            var width = _canvas.ActualWidth;
            var height = _canvas.ActualHeight;
            if (width <= 0 || height <= 0)
            {
                return;
            }

            const double gap = 2;
            const double padX = 6;
            const double padY = 6;
            var count = MaxPoints;
            var innerW = width - padX * 2;
            var blockW = Math.Max(3, (innerW - gap * (count - 1)) / count);
            var blockH = height - padY * 2;

            var data = SliceLast(records, MaxPoints);
            for (var slot = 0; slot < MaxPoints; slot++)
            {
                _bars[slot].Visibility = Visibility.Collapsed;
            }

            for (var i = 0; i < data.Count; i++)
            {
                if (data[i].ValueType != JsonValueType.Object)
                {
                    continue;
                }

                var record = data[i].GetObject();
                var state = HudChartRenderer.SampleState(record);
                var isStableHidden = !showStableBars && state == "stable";
                if (isStableHidden)
                {
                    continue;
                }

                var slot = count - data.Count + i;
                if (slot < 0 || slot >= MaxPoints)
                {
                    continue;
                }

                var x = padX + slot * (blockW + gap);
                var y = padY;
                var isLatest = i == data.Count - 1;
                var color = HudChartRenderer.SampleStateColor(record);

                _bars[slot].Width = blockW;
                _bars[slot].Height = blockH;
                _barBrushes[slot].Color = color;
                _bars[slot].Opacity = isLatest ? 1 : 0.75;
                Canvas.SetLeft(_bars[slot], x);
                Canvas.SetTop(_bars[slot], y);
                _bars[slot].Visibility = Visibility.Visible;
            }
        }

        private static List<IJsonValue> SliceLast(JsonArray array, int maxPoints)
        {
            var result = new List<IJsonValue>();
            var start = Math.Max(0, (int)array.Count - maxPoints);
            for (var i = start; i < array.Count; i++)
            {
                result.Add(array[i]);
            }

            return result;
        }
    }

    internal static class HudChartRenderer
    {
        public static Color AssessmentRecordColor(JsonObject record)
        {
            var isPerfect = JsonHelpers.GetBool(record, "isPerfect");
            var isSuccess = JsonHelpers.GetBool(record, "isSuccess");
            var timing = JsonHelpers.GetString(record, "timing", "late");
            if (isPerfect || timing == "perfect") return Color.FromArgb(0xFF, 0x5E, 0xEA, 0xD4);
            if (isSuccess) return Color.FromArgb(0xFF, 0x4A, 0xDE, 0x80);
            if (timing == "early") return Color.FromArgb(0xFF, 0xFB, 0xBF, 0x24);
            return Color.FromArgb(0xFF, 0xF8, 0x71, 0x71);
        }

        public static string SampleState(JsonObject record)
        {
            var crouchGrace = JsonHelpers.GetBool(record, "crouchGraceActive");
            var reason = JsonHelpers.GetString(record, "reason", "");
            var speedRatio = JsonHelpers.GetNumber(record, "speedRatio", 0);
            var axisConflict = JsonHelpers.GetBool(record, "axisConflict");
            if (crouchGrace || reason == "crouchGrace") return "stable";
            if (reason == "lowSpeedMovement" || speedRatio <= 1) return "stable";
            if (axisConflict || speedRatio > 1.5) return "run";
            if (speedRatio > 1) return "micro";
            return "run";
        }

        public static Color SampleStateColor(JsonObject record)
        {
            var state = SampleState(record);
            if (state == "stable") return Color.FromArgb(0xFF, 0x4A, 0xDE, 0x80);
            if (state == "micro") return Color.FromArgb(0xFF, 0xFB, 0xBF, 0x24);
            return Color.FromArgb(0xFF, 0xF8, 0x71, 0x71);
        }
    }
}
