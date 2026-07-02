using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Storage.Streams;
using Windows.UI;
using Windows.UI.Core;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Media.Animation;
using Windows.Web.Http;

namespace CSMatchHelperWidget
{
    public sealed partial class WidgetPage : Page
    {
        private const int PollFailureThreshold = 5;
        private static readonly TimeSpan PrimaryRequestTimeout = TimeSpan.FromMilliseconds(350);
        private static readonly TimeSpan FallbackRequestTimeout = TimeSpan.FromMilliseconds(150);
        private static readonly TimeSpan StreamReconnectDelay = TimeSpan.FromMilliseconds(300);
        private static readonly TimeSpan StreamReadTimeout = TimeSpan.FromSeconds(4);

        private readonly HttpClient _httpClient = new HttpClient();
        private readonly CancellationTokenSource _streamCts = new CancellationTokenSource();
        private readonly DispatcherTimer _comboHideTimer;
        private readonly AssessmentChartRenderer _assessmentChart;
        private readonly ShootingChartRenderer _shootingChart;
        private bool _streamLoopRunning;
        private int _consecutiveFailures;
        private JsonObject _lastRoot;
        private ulong _lastRecordTimestamp;
        private ChartFingerprint _lastChartFingerprint;
        private Storyboard _comboStoryboard;
        private bool _comboExitInProgress;
        private bool _comboVisible;

        public WidgetPage()
        {
            InitializeComponent();
            _assessmentChart = new AssessmentChartRenderer(AssessmentChart);
            _shootingChart = new ShootingChartRenderer(ShootingChart);
            _comboHideTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(360) };
            _comboHideTimer.Tick += OnComboHideTick;
            Loaded += OnLoaded;
            Unloaded += OnUnloaded;
        }

        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            SetLinkState(WidgetLinkState.Preparing, "正在连接 CS 匹配助手");
            _ = StreamLoopAsync();
        }

        private void OnUnloaded(object sender, RoutedEventArgs e)
        {
            _streamCts.Cancel();
            _comboHideTimer.Stop();
            StopComboAnimation();
        }

        private async Task StreamLoopAsync()
        {
            if (_streamLoopRunning)
            {
                return;
            }

            _streamLoopRunning = true;
            try
            {
                while (!_streamCts.IsCancellationRequested)
                {
                    try
                    {
                        await ReadStreamUntilDisconnectedAsync(_streamCts.Token).ConfigureAwait(false);
                        _consecutiveFailures = 0;
                    }
                    catch (Exception ex)
                    {
                        if (_streamCts.IsCancellationRequested)
                        {
                            break;
                        }

                        Debug.WriteLine($"[CSMatchHelperWidget] stream failed: {ex}");
                        _consecutiveFailures++;
                        if (_consecutiveFailures >= PollFailureThreshold)
                        {
                            await RunOnUiThreadAsync(() =>
                            {
                                ResetIdleState();
                                SetLinkState(WidgetLinkState.Offline, "请确认 CS 匹配助手已启动并开始记录");
                            });
                        }
                        else if (!_hasLiveSnapshot)
                        {
                            await RunOnUiThreadAsync(() =>
                                SetLinkState(WidgetLinkState.Preparing, "正在连接 CS 匹配助手"));
                        }
                    }

                    if (_streamCts.IsCancellationRequested)
                    {
                        break;
                    }

                    try
                    {
                        await Task.Delay(StreamReconnectDelay, _streamCts.Token).ConfigureAwait(false);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
            finally
            {
                _streamLoopRunning = false;
            }
        }

        private async Task ReadStreamUntilDisconnectedAsync(CancellationToken ct)
        {
            Exception lastError = null;

            try
            {
                await ReadStreamFromUrlAsync(
                    IpcPortDiscovery.GetPrimaryStreamUrl(),
                    PrimaryRequestTimeout,
                    ct).ConfigureAwait(false);
                return;
            }
            catch (Exception ex)
            {
                lastError = ex;
            }

            foreach (var url in IpcPortDiscovery.GetFallbackStreamUrls())
            {
                try
                {
                    await ReadStreamFromUrlAsync(url, FallbackRequestTimeout, ct).ConfigureAwait(false);
                    return;
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            throw lastError ?? new InvalidOperationException("No stream endpoint available.");
        }

        private async Task ReadStreamFromUrlAsync(string url, TimeSpan connectTimeout, CancellationToken ct)
        {
            HttpResponseMessage response;
            using (var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                connectCts.CancelAfter(connectTimeout);
                var request = new HttpRequestMessage(HttpMethod.Get, new Uri(url));
                response = await _httpClient
                    .SendRequestAsync(request, HttpCompletionOption.ResponseHeadersRead)
                    .AsTask(connectCts.Token)
                    .ConfigureAwait(false);
            }

            response.EnsureSuccessStatusCode();

            using (var stream = await response.Content.ReadAsInputStreamAsync().AsTask(ct).ConfigureAwait(false))
            {
                var reader = new DataReader(stream);
                reader.InputStreamOptions = InputStreamOptions.Partial;
                var lineBytes = new List<byte>();

                while (!ct.IsCancellationRequested)
                {
                    uint loaded;
                    using (var readCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
                    {
                        readCts.CancelAfter(StreamReadTimeout);
                        loaded = await reader.LoadAsync(4096).AsTask(readCts.Token).ConfigureAwait(false);
                    }

                    if (loaded == 0)
                    {
                        break;
                    }

                    while (reader.UnconsumedBufferLength > 0)
                    {
                        var b = reader.ReadByte();
                        if (b == 0x0A)
                        {
                            if (lineBytes.Count > 0 && lineBytes[lineBytes.Count - 1] == 0x0D)
                            {
                                lineBytes.RemoveAt(lineBytes.Count - 1);
                            }

                            var line = Encoding.UTF8.GetString(lineBytes.ToArray()).Trim();
                            lineBytes.Clear();
                            if (!string.IsNullOrEmpty(line))
                            {
                                await DispatchSnapshotLineAsync(line).ConfigureAwait(false);
                            }
                        }
                        else
                        {
                            lineBytes.Add(b);
                        }
                    }
                }
            }
        }

        private Task DispatchSnapshotLineAsync(string line)
        {
            return Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                try
                {
                    ApplySnapshot(JsonObject.Parse(line));
                    _consecutiveFailures = 0;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[CSMatchHelperWidget] snapshot parse failed: {ex}");
                }
            }).AsTask();
        }

        private Task RunOnUiThreadAsync(Action action)
        {
            return Dispatcher.RunAsync(
                CoreDispatcherPriority.Normal,
                () => action()).AsTask();
        }

        private bool _hasLiveSnapshot;

        private void OnComboHideTick(object sender, object e)
        {
            _comboHideTimer.Stop();
            PlayComboExitAnimation();
        }

        private void OnChartSizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (_lastRoot != null)
            {
                _lastChartFingerprint = default(ChartFingerprint);
                RedrawCharts(_lastRoot);
            }
        }

        private enum WidgetLinkState
        {
            Preparing,
            Live,
            Offline,
        }

        private void SetLinkState(WidgetLinkState state, string hint = null)
        {
            switch (state)
            {
                case WidgetLinkState.Live:
                    StatusOverlay.Visibility = Visibility.Collapsed;
                    return;
                case WidgetLinkState.Offline:
                    StatusText.Text = "未连接";
                    StatusHintText.Text = hint ?? "请确认 CS 匹配助手已启动并开始记录";
                    StatusOverlay.Visibility = Visibility.Visible;
                    return;
                default:
                    StatusText.Text = "数据准备中…";
                    StatusHintText.Text = hint ?? "正在连接 CS 匹配助手";
                    StatusOverlay.Visibility = Visibility.Visible;
                    return;
            }
        }

        private void ResetIdleState()
        {
            _lastRoot = null;
            _lastRecordTimestamp = 0;
            _lastChartFingerprint = default(ChartFingerprint);
            _consecutiveFailures = 0;
            _hasLiveSnapshot = false;
            ResetAssessmentStats();
            ResetShootingStats();
            _assessmentChart.Reset();
            _shootingChart.Reset();
            HideComboImmediate();
        }

        private void ApplySnapshot(JsonObject root)
        {
            _lastRoot = root;
            var active = JsonHelpers.GetBool(root, "active");
            var listening = JsonHelpers.GetBool(root, "listening");

            if (!active || !listening)
            {
                _hasLiveSnapshot = false;
                ResetIdleState();
                SetLinkState(
                    WidgetLinkState.Preparing,
                    active ? "等待开始记录" : "请先在急停助手中开始记录");
                return;
            }

            _hasLiveSnapshot = true;
            SetLinkState(WidgetLinkState.Live);

            ApplyAssessment(root);
            ApplyShooting(root);

            var fingerprint = BuildChartFingerprint(root);
            if (!fingerprint.Equals(_lastChartFingerprint))
            {
                _lastChartFingerprint = fingerprint;
                RedrawCharts(root);
            }
        }

        private void ApplyAssessment(JsonObject root)
        {
            var records = JsonHelpers.GetArray(root, "records");
            var hasRecords = records.Count > 0;

            if (!hasRecords)
            {
                ResetAssessmentStats();
                HideComboImmediate();
                return;
            }

            var avgDiffMs = JsonHelpers.GetNumber(root, "avgDiffMs");
            var successRate = JsonHelpers.GetNumber(root, "successRate");
            var stdDevMs = JsonHelpers.GetNumber(root, "stdDevMs");
            var tendency = JsonHelpers.GetString(root, "tendency", "normal");
            var tendencyLabel = JsonHelpers.GetString(root, "tendencyLabel", "正常");

            SetShadowedStatValue(AvgDiffText, AvgDiffTextShadow, FormatDiffMs(avgDiffMs), BrushForAvgDiff(avgDiffMs));
            SetShadowedStatValue(SuccessRateText, SuccessRateTextShadow, $"{successRate:F1}%", BrushForSuccessRate(successRate));
            SetShadowedStatValue(StdDevText, StdDevTextShadow, $"{Math.Round(stdDevMs)}ms", BrushForStdDev(stdDevMs));
            SetShadowedStatValue(TendencyText, TendencyTextShadow, tendencyLabel, BrushForTendency(tendency));

            if (root.TryGetValue("lastRecord", out var lastRecordValue) && lastRecordValue.ValueType == JsonValueType.Object)
            {
                ShowComboIfNew(lastRecordValue.GetObject());
            }
        }

        private void ApplyShooting(JsonObject root)
        {
            JsonObject shooting = null;
            if (root.TryGetValue("shooting", out var shootingValue) && shootingValue.ValueType == JsonValueType.Object)
            {
                shooting = shootingValue.GetObject();
            }

            if (shooting == null)
            {
                ResetShootingStats();
                return;
            }

            var shotRecords = JsonHelpers.GetArray(shooting, "shotRecords");
            if (shotRecords.Count == 0)
            {
                ResetShootingStats();
                return;
            }

            var avgError = JsonHelpers.GetNumber(shooting, "avgError");
            var stableRate = JsonHelpers.GetNumber(shooting, "stableRate");

            SetShadowedStatValue(AvgErrorText, AvgErrorTextShadow, avgError.ToString("F2"), BrushForError(avgError));
            SetShadowedStatValue(StableRateText, StableRateTextShadow, $"{stableRate:F1}%", BrushForSuccessRate(stableRate));
        }

        private void RedrawCharts(JsonObject root)
        {
            var assessmentRecords = JsonHelpers.GetArray(root, "records");
            _assessmentChart.Update(assessmentRecords);

            var showStableBars = true;
            var shotRecords = new JsonArray();
            if (root.TryGetValue("shooting", out var shootingValue) && shootingValue.ValueType == JsonValueType.Object)
            {
                var shooting = shootingValue.GetObject();
                shotRecords = JsonHelpers.GetArray(shooting, "shotRecords");
                showStableBars = JsonHelpers.GetBool(shooting, "hudShowStableBars", true);
            }

            _shootingChart.Update(shotRecords, showStableBars);
        }

        private ChartFingerprint BuildChartFingerprint(JsonObject root)
        {
            var assessmentRecords = JsonHelpers.GetArray(root, "records");
            var shootingRecords = new JsonArray();
            var showStableBars = true;
            if (root.TryGetValue("shooting", out var shootingValue) && shootingValue.ValueType == JsonValueType.Object)
            {
                var shooting = shootingValue.GetObject();
                shootingRecords = JsonHelpers.GetArray(shooting, "shotRecords");
                showStableBars = JsonHelpers.GetBool(shooting, "hudShowStableBars", true);
            }

            return new ChartFingerprint
            {
                AssessmentCount = (uint)assessmentRecords.Count,
                AssessmentLastTimestamp = GetLastTimestamp(assessmentRecords),
                ShootingCount = (uint)shootingRecords.Count,
                ShootingLastTimestamp = GetLastTimestamp(shootingRecords),
                ShowStableBars = showStableBars,
                AssessmentWidth = AssessmentChart.ActualWidth,
                AssessmentHeight = AssessmentChart.ActualHeight,
                ShootingWidth = ShootingChart.ActualWidth,
                ShootingHeight = ShootingChart.ActualHeight,
            };
        }

        private static ulong GetLastTimestamp(JsonArray records)
        {
            if (records.Count == 0)
            {
                return 0;
            }

            var last = records[records.Count - 1];
            if (last.ValueType != JsonValueType.Object)
            {
                return 0;
            }

            return (ulong)JsonHelpers.GetNumber(last.GetObject(), "timestampMs");
        }

        private struct ChartFingerprint : IEquatable<ChartFingerprint>
        {
            public uint AssessmentCount;
            public ulong AssessmentLastTimestamp;
            public uint ShootingCount;
            public ulong ShootingLastTimestamp;
            public bool ShowStableBars;
            public double AssessmentWidth;
            public double AssessmentHeight;
            public double ShootingWidth;
            public double ShootingHeight;

            public bool Equals(ChartFingerprint other)
            {
                return AssessmentCount == other.AssessmentCount
                    && AssessmentLastTimestamp == other.AssessmentLastTimestamp
                    && ShootingCount == other.ShootingCount
                    && ShootingLastTimestamp == other.ShootingLastTimestamp
                    && ShowStableBars == other.ShowStableBars
                    && Math.Abs(AssessmentWidth - other.AssessmentWidth) < 0.5
                    && Math.Abs(AssessmentHeight - other.AssessmentHeight) < 0.5
                    && Math.Abs(ShootingWidth - other.ShootingWidth) < 0.5
                    && Math.Abs(ShootingHeight - other.ShootingHeight) < 0.5;
            }

            public override bool Equals(object obj)
            {
                return obj is ChartFingerprint other && Equals(other);
            }

            public override int GetHashCode()
            {
                unchecked
                {
                    var hash = 17;
                    hash = hash * 31 + AssessmentCount.GetHashCode();
                    hash = hash * 31 + AssessmentLastTimestamp.GetHashCode();
                    hash = hash * 31 + ShootingCount.GetHashCode();
                    hash = hash * 31 + ShootingLastTimestamp.GetHashCode();
                    hash = hash * 31 + ShowStableBars.GetHashCode();
                    hash = hash * 31 + AssessmentWidth.GetHashCode();
                    hash = hash * 31 + AssessmentHeight.GetHashCode();
                    hash = hash * 31 + ShootingWidth.GetHashCode();
                    hash = hash * 31 + ShootingHeight.GetHashCode();
                    return hash;
                }
            }
        }

        private void ShowComboIfNew(JsonObject record)
        {
            var timestampMs = (ulong)JsonHelpers.GetNumber(record, "timestampMs");
            if (timestampMs == _lastRecordTimestamp)
            {
                return;
            }

            _lastRecordTimestamp = timestampMs;
            var diffMs = JsonHelpers.GetNumber(record, "diffMs");
            var fromKey = JsonHelpers.GetString(record, "fromKey", "?");
            var toKey = JsonHelpers.GetString(record, "toKey", "?");
            var timing = JsonHelpers.GetString(record, "timing", "late");
            var isPerfect = JsonHelpers.GetBool(record, "isPerfect");
            var isSuccess = JsonHelpers.GetBool(record, "isSuccess");

            var accent = BrushForTiming(timing, isPerfect, isSuccess);
            var label = ComboLabel(timing, isPerfect, isSuccess);
            var meta = $"{fromKey} → {toKey} · {FormatDiffMsOneDecimal(diffMs)}";

            SetShadowedComboLabel(label, accent);
            SetShadowedComboMeta(meta);

            _comboHideTimer.Stop();
            _comboExitInProgress = false;

            var skipEnterAnimation = _comboVisible
                || _comboStoryboard != null
                || ComboOverlay.Visibility == Visibility.Visible;

            StopComboAnimation();

            if (skipEnterAnimation)
            {
                ShowComboAtRest();
            }
            else
            {
                PlayComboEnterAnimation();
            }

            _comboHideTimer.Start();
        }

        private void ShowComboAtRest()
        {
            ComboOverlay.Visibility = Visibility.Visible;
            ComboOverlay.Opacity = 1;
            ComboTransform.ScaleX = 1;
            ComboTransform.ScaleY = 1;
            ComboTransform.TranslateY = 0;
            _comboVisible = true;
        }

        private void PlayComboEnterAnimation()
        {
            StopComboAnimation();

            ComboOverlay.Visibility = Visibility.Visible;
            ComboOverlay.Opacity = 0;
            ComboTransform.ScaleX = 1.35;
            ComboTransform.ScaleY = 1.35;
            ComboTransform.TranslateY = 4;

            var easing = new BackEase { Amplitude = 0.55, EasingMode = EasingMode.EaseOut };
            var sb = new Storyboard();

            sb.Children.Add(CreateDoubleAnimation(
                ComboOverlay,
                "Opacity",
                0,
                1,
                TimeSpan.FromMilliseconds(70)));

            sb.Children.Add(CreateDoubleAnimation(
                ComboTransform,
                "ScaleX",
                1.35,
                1,
                TimeSpan.FromMilliseconds(180),
                easing));

            sb.Children.Add(CreateDoubleAnimation(
                ComboTransform,
                "ScaleY",
                1.35,
                1,
                TimeSpan.FromMilliseconds(180),
                easing));

            sb.Children.Add(CreateDoubleAnimation(
                ComboTransform,
                "TranslateY",
                4,
                0,
                TimeSpan.FromMilliseconds(180),
                easing));

            sb.Completed += OnComboEnterCompleted;
            _comboStoryboard = sb;
            sb.Begin();
        }

        private void OnComboEnterCompleted(object sender, object e)
        {
            if (_comboStoryboard != null)
            {
                _comboStoryboard.Completed -= OnComboEnterCompleted;
                _comboStoryboard = null;
            }
            _comboVisible = true;
        }

        private void PlayComboExitAnimation()
        {
            if (_comboExitInProgress || ComboOverlay.Visibility != Visibility.Visible)
            {
                return;
            }

            _comboExitInProgress = true;
            StopComboAnimation();

            var easing = new CubicEase { EasingMode = EasingMode.EaseIn };
            var sb = new Storyboard();

            sb.Children.Add(CreateDoubleAnimation(
                ComboOverlay,
                "Opacity",
                ComboOverlay.Opacity,
                0,
                TimeSpan.FromMilliseconds(100),
                easing));

            sb.Children.Add(CreateDoubleAnimation(
                ComboTransform,
                "ScaleX",
                ComboTransform.ScaleX,
                0.95,
                TimeSpan.FromMilliseconds(100),
                easing));

            sb.Children.Add(CreateDoubleAnimation(
                ComboTransform,
                "ScaleY",
                ComboTransform.ScaleY,
                0.95,
                TimeSpan.FromMilliseconds(100),
                easing));

            sb.Children.Add(CreateDoubleAnimation(
                ComboTransform,
                "TranslateY",
                ComboTransform.TranslateY,
                -8,
                TimeSpan.FromMilliseconds(100),
                easing));

            sb.Completed += OnComboExitCompleted;
            _comboStoryboard = sb;
            sb.Begin();
        }

        private void OnComboExitCompleted(object sender, object e)
        {
            _comboExitInProgress = false;
            _comboVisible = false;
            HideComboImmediate();
        }

        private void HideComboImmediate()
        {
            StopComboAnimation();
            _comboHideTimer.Stop();
            _comboVisible = false;
            ComboOverlay.Visibility = Visibility.Collapsed;
            ComboOverlay.Opacity = 0;
            ComboTransform.ScaleX = 1.35;
            ComboTransform.ScaleY = 1.35;
            ComboTransform.TranslateY = 4;
        }

        private void StopComboAnimation()
        {
            if (_comboStoryboard != null)
            {
                _comboStoryboard.Stop();
                _comboStoryboard.Completed -= OnComboExitCompleted;
                _comboStoryboard.Completed -= OnComboEnterCompleted;
                _comboStoryboard = null;
            }
        }

        private static DoubleAnimation CreateDoubleAnimation(
            DependencyObject target,
            string propertyPath,
            double from,
            double to,
            TimeSpan duration,
            EasingFunctionBase easing = null)
        {
            var animation = new DoubleAnimation
            {
                From = from,
                To = to,
                Duration = duration,
                EasingFunction = easing,
            };
            Storyboard.SetTarget(animation, target);
            Storyboard.SetTargetProperty(animation, propertyPath);
            return animation;
        }

        private static void SetShadowedStatValue(
            TextBlock front,
            TextBlock shadow,
            string text,
            SolidColorBrush foreground)
        {
            front.Text = text;
            shadow.Text = text;
            front.Foreground = foreground;
        }

        private void SetShadowedComboLabel(string text, SolidColorBrush accent)
        {
            ComboLabelText.Text = text;
            ComboLabelShadow.Text = text;
            ComboLabelGlow.Text = text;
            ComboLabelText.Foreground = accent;
            ComboLabelGlow.Foreground = accent;
        }

        private void SetShadowedComboMeta(string text)
        {
            ComboMetaText.Text = text;
            ComboMetaShadow.Text = text;
        }

        private void ResetAssessmentStats()
        {
            SetShadowedStatValue(AvgDiffText, AvgDiffTextShadow, "—", HudBrushes.DefaultValue);
            SetShadowedStatValue(SuccessRateText, SuccessRateTextShadow, "—", HudBrushes.DefaultValue);
            SetShadowedStatValue(StdDevText, StdDevTextShadow, "—", HudBrushes.DefaultValue);
            SetShadowedStatValue(TendencyText, TendencyTextShadow, "—", HudBrushes.DefaultValue);
        }

        private void ResetShootingStats()
        {
            SetShadowedStatValue(AvgErrorText, AvgErrorTextShadow, "—", HudBrushes.DefaultValue);
            SetShadowedStatValue(StableRateText, StableRateTextShadow, "—", HudBrushes.DefaultValue);
        }

        private static string ComboLabel(string timing, bool isPerfect, bool isSuccess)
        {
            if (isPerfect || timing == "perfect") return "完美";
            if (isSuccess) return "优秀";
            if (timing == "early") return "偏早";
            return "偏晚";
        }

        private static string FormatDiffMs(double diffMs)
        {
            var rounded = (int)Math.Round(diffMs);
            return rounded > 0 ? $"+{rounded}ms" : $"{rounded}ms";
        }

        private static string FormatDiffMsOneDecimal(double diffMs)
        {
            return diffMs > 0 ? $"+{diffMs:F1}ms" : $"{diffMs:F1}ms";
        }

        private static SolidColorBrush BrushForTiming(string timing, bool isPerfect = false, bool isSuccess = false)
        {
            if (isPerfect || timing == "perfect") return HudBrushes.Perfect;
            if (isSuccess) return HudBrushes.Success;
            if (timing == "early") return HudBrushes.Early;
            return HudBrushes.Late;
        }

        private static SolidColorBrush BrushForAvgDiff(double avgDiffMs)
        {
            if (avgDiffMs < -5) return HudBrushes.Early;
            if (avgDiffMs > 5) return HudBrushes.Late;
            return HudBrushes.Success;
        }

        private static SolidColorBrush BrushForSuccessRate(double rate)
        {
            if (rate >= 70) return HudBrushes.Success;
            if (rate >= 40) return HudBrushes.Early;
            return HudBrushes.Late;
        }

        private static SolidColorBrush BrushForStdDev(double stdDevMs)
        {
            if (stdDevMs <= 3) return HudBrushes.Success;
            if (stdDevMs <= 8) return HudBrushes.Early;
            return HudBrushes.Late;
        }

        private static SolidColorBrush BrushForTendency(string tendency)
        {
            if (tendency == "early") return HudBrushes.Early;
            if (tendency == "late") return HudBrushes.Late;
            return HudBrushes.Success;
        }

        private static SolidColorBrush BrushForError(double error)
        {
            if (error <= 0.15) return HudBrushes.Success;
            if (error <= 0.35) return HudBrushes.Early;
            return HudBrushes.Late;
        }
    }

    internal static class HudBrushes
    {
        public static readonly SolidColorBrush DefaultValue = Solid(0xE6, 0xF8, 0xFA, 0xFC);
        public static readonly SolidColorBrush Perfect = Solid(0xFF, 0x5E, 0xEA, 0xD4);
        public static readonly SolidColorBrush Success = Solid(0xFF, 0x4A, 0xDE, 0x80);
        public static readonly SolidColorBrush Early = Solid(0xFF, 0xFB, 0xBF, 0x24);
        public static readonly SolidColorBrush Late = Solid(0xFF, 0xF8, 0x71, 0x71);

        private static SolidColorBrush Solid(byte a, byte r, byte g, byte b)
        {
            return new SolidColorBrush(Color.FromArgb(a, r, g, b));
        }
    }

    internal static class JsonHelpers
    {
        public static bool GetBool(JsonObject obj, string name, bool fallback = false)
        {
            if (obj.TryGetValue(name, out var value) && value.ValueType == JsonValueType.Boolean)
            {
                return value.GetBoolean();
            }

            return fallback;
        }

        public static double GetNumber(JsonObject obj, string name, double fallback = 0)
        {
            if (obj.TryGetValue(name, out var value) && value.ValueType == JsonValueType.Number)
            {
                return value.GetNumber();
            }

            return fallback;
        }

        public static string GetString(JsonObject obj, string name, string fallback = "")
        {
            if (obj.TryGetValue(name, out var value) && value.ValueType == JsonValueType.String)
            {
                return value.GetString();
            }

            return fallback;
        }

        public static JsonArray GetArray(JsonObject obj, string name)
        {
            if (obj.TryGetValue(name, out var value) && value.ValueType == JsonValueType.Array)
            {
                return value.GetArray();
            }

            return new JsonArray();
        }
    }
}
