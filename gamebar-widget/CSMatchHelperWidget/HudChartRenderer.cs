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
        private readonly Rectangle[] _greenBars;
        private readonly Rectangle[] _yellowBars;
        private readonly Rectangle[] _redBars;
        private readonly Line[] _thresholdLines;
        private readonly SolidColorBrush[] _greenBrushes;
        private readonly SolidColorBrush[] _yellowBrushes;
        private readonly SolidColorBrush[] _redBrushes;
        private readonly SolidColorBrush _thresholdBrush;

        public ShootingChartRenderer(Canvas canvas)
        {
            _canvas = canvas;
            _thresholdBrush = new SolidColorBrush(Color.FromArgb(0x38, 0xFF, 0xFF, 0xFF));

            _greenBars = new Rectangle[MaxPoints];
            _yellowBars = new Rectangle[MaxPoints];
            _redBars = new Rectangle[MaxPoints];
            _thresholdLines = new Line[MaxPoints];
            _greenBrushes = new SolidColorBrush[MaxPoints];
            _yellowBrushes = new SolidColorBrush[MaxPoints];
            _redBrushes = new SolidColorBrush[MaxPoints];

            for (var i = 0; i < MaxPoints; i++)
            {
                var greenBrush = new SolidColorBrush(Colors.Transparent);
                _greenBrushes[i] = greenBrush;
                _greenBars[i] = CreateBar(greenBrush);
                _canvas.Children.Add(_greenBars[i]);

                var yellowBrush = new SolidColorBrush(Colors.Transparent);
                _yellowBrushes[i] = yellowBrush;
                _yellowBars[i] = CreateBar(yellowBrush);
                _canvas.Children.Add(_yellowBars[i]);

                var redBrush = new SolidColorBrush(Colors.Transparent);
                _redBrushes[i] = redBrush;
                _redBars[i] = CreateBar(redBrush);
                _canvas.Children.Add(_redBars[i]);

                _thresholdLines[i] = new Line
                {
                    Stroke = _thresholdBrush,
                    StrokeThickness = 1,
                    StrokeDashArray = new DoubleCollection { 2, 2 },
                    Visibility = Visibility.Collapsed,
                };
                _canvas.Children.Add(_thresholdLines[i]);
            }
        }

        private static Rectangle CreateBar(SolidColorBrush brush)
        {
            return new Rectangle
            {
                RadiusX = 1,
                RadiusY = 1,
                Fill = brush,
                Visibility = Visibility.Collapsed,
            };
        }

        public void Reset()
        {
            for (var i = 0; i < MaxPoints; i++)
            {
                _greenBars[i].Visibility = Visibility.Collapsed;
                _yellowBars[i].Visibility = Visibility.Collapsed;
                _redBars[i].Visibility = Visibility.Collapsed;
                _thresholdLines[i].Visibility = Visibility.Collapsed;
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
            var barBottom = padY + blockH;

            var data = SliceLast(records, MaxPoints);
            for (var slot = 0; slot < MaxPoints; slot++)
            {
                _greenBars[slot].Visibility = Visibility.Collapsed;
                _yellowBars[slot].Visibility = Visibility.Collapsed;
                _redBars[slot].Visibility = Visibility.Collapsed;
                _thresholdLines[slot].Visibility = Visibility.Collapsed;
            }

            for (var i = 0; i < data.Count; i++)
            {
                if (data[i].ValueType != JsonValueType.Object)
                {
                    continue;
                }

                var record = data[i].GetObject();
                var seg = HudChartRenderer.ShotBarSegments(record);
                var isStableHidden = !showStableBars && seg.State == "stable";
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

                var greenH = seg.GreenRatio * blockH;
                var yellowH = seg.YellowRatio * blockH;
                var redH = seg.RedRatio * blockH;
                var thresholdY = barBottom - seg.ThresholdLineRatio * blockH;

                _thresholdLines[slot].X1 = x + 1;
                _thresholdLines[slot].Y1 = thresholdY;
                _thresholdLines[slot].X2 = x + blockW - 1;
                _thresholdLines[slot].Y2 = thresholdY;
                _thresholdLines[slot].Visibility = Visibility.Visible;

                if (greenH > 0)
                {
                    _greenBars[slot].Width = blockW;
                    _greenBars[slot].Height = greenH;
                    _greenBrushes[slot].Color = seg.StableColor;
                    Canvas.SetLeft(_greenBars[slot], x);
                    Canvas.SetTop(_greenBars[slot], barBottom - greenH);
                    _greenBars[slot].Visibility = Visibility.Visible;
                }

                if (yellowH > 0)
                {
                    _yellowBars[slot].Width = blockW;
                    _yellowBars[slot].Height = yellowH;
                    _yellowBrushes[slot].Color = HudChartRenderer.MicroColor;
                    Canvas.SetLeft(_yellowBars[slot], x);
                    Canvas.SetTop(_yellowBars[slot], barBottom - greenH - yellowH);
                    _yellowBars[slot].Visibility = Visibility.Visible;
                }

                if (redH > 0)
                {
                    _redBars[slot].Width = blockW;
                    _redBars[slot].Height = redH;
                    _redBrushes[slot].Color = HudChartRenderer.RunColor;
                    Canvas.SetLeft(_redBars[slot], x);
                    Canvas.SetTop(_redBars[slot], barBottom - greenH - yellowH - redH);
                    _redBars[slot].Visibility = Visibility.Visible;
                }
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

    internal struct ShotBarSegments
    {
        public string State;
        public Color StableColor;
        public double GreenRatio;
        public double YellowRatio;
        public double RedRatio;
        public double ThresholdLineRatio;
        public bool IsCrouchGrace;
        public bool IsFireHeld;
    }

    internal static class HudChartRenderer
    {
        private const double MicroRatio = 1.5;
        private const double MinVisibleRatio = 0.12;
        private const double ThresholdLineRatio = 0.5;
        private const double MaxDisplayRatio = 2.0;
        private const double YellowStartRatio = 1.02;
        private const double YellowFullRatio = 1.35;
        private const double MinYellowRatio = 0.08;
        private const double RedStartRatio = 1.35;
        private const double RedFullRatio = 1.8;

        public static readonly Color MicroColor = Color.FromArgb(0xFF, 0xFB, 0xBF, 0x24);
        public static readonly Color RunColor = Color.FromArgb(0xFF, 0xF8, 0x71, 0x71);

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
            if (reason == "crouching") return "stable";
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

        public static ShotBarSegments ShotBarSegments(JsonObject record)
        {
            var state = SampleState(record);
            var speedRatio = JsonHelpers.GetNumber(record, "speedRatio", 0);
            var thresholdFill = Clamp01(speedRatio);
            var upperZone = 1 - ThresholdLineRatio;

            var crouchGrace = JsonHelpers.GetBool(record, "crouchGraceActive");
            var reason = JsonHelpers.GetString(record, "reason", "");
            var isCrouchGrace = crouchGrace || reason == "crouchGrace";
            var isCrouching = reason == "crouching";
            var isLowRiskStable = isCrouchGrace || isCrouching;
            var sampleKind = JsonHelpers.GetString(record, "sampleKind", "fireDown");
            var fireHeld = JsonHelpers.GetBool(record, "fireHeld");
            var axisConflict = JsonHelpers.GetBool(record, "axisConflict");

            var greenRatio = 0.0;
            var yellowRatio = 0.0;
            var redRatio = 0.0;

            if (state == "stable")
            {
                greenRatio = isLowRiskStable
                    ? MinVisibleRatio
                    : Math.Max(MinVisibleRatio, thresholdFill * ThresholdLineRatio);
            }
            else if (state == "micro")
            {
                greenRatio = ThresholdLineRatio;
                yellowRatio = YellowVisualFill(speedRatio) * upperZone;
            }
            else
            {
                var severity = axisConflict
                    ? Math.Max(0.5, Clamp01((speedRatio - 1) / (RedFullRatio - 1)))
                    : Math.Max(
                        MinYellowRatio,
                        Clamp01((speedRatio - MicroRatio) / (RedFullRatio - MicroRatio)));
                redRatio = Math.Max(
                    MinVisibleRatio,
                    ThresholdLineRatio + severity * upperZone);
            }

            var stableColor = isCrouchGrace
                ? Color.FromArgb(0xFF, 0x5E, 0xEA, 0xD4)
                : Color.FromArgb(0xFF, 0x4A, 0xDE, 0x80);

            return new ShotBarSegments
            {
                State = state,
                StableColor = stableColor,
                GreenRatio = greenRatio,
                YellowRatio = yellowRatio,
                RedRatio = redRatio,
                ThresholdLineRatio = ThresholdLineRatio,
                IsCrouchGrace = isCrouchGrace,
                IsFireHeld = fireHeld || sampleKind == "fireHeld",
            };
        }

        private static double YellowVisualFill(double speedRatio)
        {
            var yellowRaw = Clamp01(
                (speedRatio - YellowStartRatio) / (YellowFullRatio - YellowStartRatio));
            if (yellowRaw <= 0)
            {
                return 0;
            }

            return Math.Max(MinYellowRatio, Math.Sqrt(yellowRaw));
        }

        private static double Clamp01(double value)
        {
            if (value < 0) return 0;
            if (value > 1) return 1;
            return value;
        }
    }
}
