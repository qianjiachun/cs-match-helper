using System;
using System.Collections.Generic;
using System.IO;
using Windows.Data.Json;

namespace CSMatchHelperWidget
{
    internal static class IpcPortDiscovery
    {
        private const string DefaultHost = "127.0.0.1";
        private const int DefaultPort = 39281;
        private const string DiscoveryFileName = "ipc-port.json";

        public static string GetPrimarySnapshotUrl()
        {
            var port = ReadDiscoveredPort() ?? DefaultPort;
            return BuildSnapshotUrl(port);
        }

        public static string GetPrimaryStreamUrl()
        {
            var port = ReadDiscoveredPort() ?? DefaultPort;
            return BuildStreamUrl(port);
        }

        public static IReadOnlyList<string> GetFallbackSnapshotUrls()
        {
            var urls = new List<string>();
            var seen = new HashSet<int>();

            var primaryPort = ReadDiscoveredPort() ?? DefaultPort;
            seen.Add(primaryPort);

            TryAddUrl(urls, seen, DefaultPort);
            for (var port = DefaultPort + 1; port <= DefaultPort + 9; port++)
            {
                TryAddUrl(urls, seen, port);
            }

            return urls;
        }

        public static IReadOnlyList<string> GetFallbackStreamUrls()
        {
            var urls = new List<string>();
            var seen = new HashSet<int>();

            var primaryPort = ReadDiscoveredPort() ?? DefaultPort;
            seen.Add(primaryPort);

            TryAddStreamUrl(urls, seen, DefaultPort);
            for (var port = DefaultPort + 1; port <= DefaultPort + 9; port++)
            {
                TryAddStreamUrl(urls, seen, port);
            }

            return urls;
        }

        public static IReadOnlyList<string> GetSnapshotUrls()
        {
            var urls = new List<string> { GetPrimarySnapshotUrl() };
            var seen = new HashSet<int> { ReadDiscoveredPort() ?? DefaultPort };
            foreach (var url in GetFallbackSnapshotUrls())
            {
                var port = ParsePort(url);
                if (port.HasValue && seen.Add(port.Value))
                {
                    urls.Add(url);
                }
            }

            return urls;
        }

        public static IReadOnlyList<string> GetStreamUrls()
        {
            var urls = new List<string> { GetPrimaryStreamUrl() };
            var seen = new HashSet<int> { ReadDiscoveredPort() ?? DefaultPort };
            foreach (var url in GetFallbackStreamUrls())
            {
                var port = ParsePort(url);
                if (port.HasValue && seen.Add(port.Value))
                {
                    urls.Add(url);
                }
            }

            return urls;
        }

        private static int? ReadDiscoveredPort()
        {
            try
            {
                var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                var path = Path.Combine(localAppData, "CSMatchHelper", "gamebar-widget", DiscoveryFileName);
                if (!File.Exists(path))
                {
                    return null;
                }

                var json = File.ReadAllText(path);
                var root = JsonObject.Parse(json);
                if (!JsonHelpers.GetBool(root, "active", true))
                {
                    return null;
                }

                var port = (int)JsonHelpers.GetNumber(root, "port", DefaultPort);
                if (port <= 0 || port > 65535)
                {
                    return null;
                }

                return port;
            }
            catch
            {
                return null;
            }
        }

        private static string BuildSnapshotUrl(int port)
        {
            return $"http://{DefaultHost}:{port}/snapshot";
        }

        private static string BuildStreamUrl(int port)
        {
            return $"http://{DefaultHost}:{port}/stream";
        }

        private static int? ParsePort(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return null;
            }

            var marker = $"{DefaultHost}:";
            var start = url.IndexOf(marker, StringComparison.Ordinal);
            if (start < 0)
            {
                return null;
            }

            start += marker.Length;
            var end = url.IndexOf('/', start);
            var portText = end < 0 ? url.Substring(start) : url.Substring(start, end - start);
            return int.TryParse(portText, out var port) ? port : (int?)null;
        }

        private static void TryAddUrl(List<string> urls, HashSet<int> seen, int? port)
        {
            if (!port.HasValue || !seen.Add(port.Value))
            {
                return;
            }

            urls.Add(BuildSnapshotUrl(port.Value));
        }

        private static void TryAddStreamUrl(List<string> urls, HashSet<int> seen, int? port)
        {
            if (!port.HasValue || !seen.Add(port.Value))
            {
                return;
            }

            urls.Add(BuildStreamUrl(port.Value));
        }
    }
}
