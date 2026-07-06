using System;

namespace CSMatchHelperWidget
{
    internal static class HudDisplayMetrics
    {
        public const double StatTextScaleMin = 0.6;
        public const double StatTextScaleMax = 1.6;
        public const double LineStrokeWidthMin = 0.5;
        public const double LineStrokeWidthMax = 4.0;
        public const double ChartOpacityMin = 0.15;
        public const double ChartOpacityMax = 1.0;
        public const double LabelMinPx = 7;
        public const double LabelMaxPx = 14;
        public const double ValueMinPx = 8;
        public const double ValueMaxPx = 16;
        public const double LabelBasePx = 9;
        public const double ValueBasePx = 10;

        public static double ClampStatTextScale(double value)
        {
            return Math.Max(StatTextScaleMin, Math.Min(StatTextScaleMax, value));
        }

        public static double ClampLineStrokeWidth(double value)
        {
            return Math.Max(LineStrokeWidthMin, Math.Min(LineStrokeWidthMax, value));
        }

        public static double ClampChartOpacity(double value)
        {
            return Math.Max(ChartOpacityMin, Math.Min(ChartOpacityMax, value));
        }

        public static (double LabelPx, double ValuePx) ComputeStatFontSizes(double userScale)
        {
            var scale = ClampStatTextScale(userScale);
            var labelPx = Math.Max(LabelMinPx, Math.Min(LabelMaxPx, Math.Round(LabelBasePx * scale)));
            var valuePx = Math.Max(ValueMinPx, Math.Min(ValueMaxPx, Math.Round(ValueBasePx * scale)));
            return (labelPx, valuePx);
        }
    }
}
