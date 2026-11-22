using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("NAI5 画师调配台")]
[assembly: AssemblyDescription("NAI5 画师调配台本地启动器")]
[assembly: AssemblyProduct("NAI5 Artist Roller")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class Program
{
    private const string AppId = "nai5-artist-roller";
    private const string Title = "NAI5 画师调配台";
    private const int DefaultPort = 4173;

    [STAThread]
    private static int Main(string[] args)
    {
        bool stopOnly = false;
        bool noBrowser = false;
        bool silent = false;

        foreach (string rawArg in args)
        {
            string arg = (rawArg ?? string.Empty).Trim().ToLowerInvariant();
            if (arg == "--stop" || arg == "-stop") stopOnly = true;
            else if (arg == "--no-browser" || arg == "-nobrowser") noBrowser = true;
            else if (arg == "--silent" || arg == "-silent") silent = true;
        }

        string root = NormalizePath(AppDomain.CurrentDomain.BaseDirectory);
        string serveScript = Path.Combine(root, "scripts", "serve.mjs");
        int port = ResolvePort();
        string baseUrl = "http://127.0.0.1:" + port + "/";
        string healthUrl = baseUrl + "__nai5_health";

        try
        {
            if (stopOnly)
            {
                StopServer(root, serveScript, silent);
                return 0;
            }

            string distIndex = Path.Combine(root, "dist", "index.html");
            if (!File.Exists(distIndex))
            {
                ShowError("缺少构建文件 dist\\index.html。\n请在项目目录运行 npm.cmd ci 和 npm.cmd run build。", silent);
                return 1;
            }
            if (!File.Exists(serveScript))
            {
                ShowError("缺少服务脚本 scripts\\serve.mjs。", silent);
                return 1;
            }

            HealthState existing = ProbeHealth(healthUrl, 1500);
            if (existing.Status == HealthStatus.ForeignPortInUse)
            {
                ShowError(port + " 端口已被其他应用占用，无法启动本工具。", silent);
                return 1;
            }

            if (existing.Status == HealthStatus.NotRunning)
            {
                string nodePath = FindNodeExecutable();
                if (string.IsNullOrEmpty(nodePath))
                {
                    ShowError("未找到 Node.js (node.exe)。\n请确认已安装 Node.js 并添加到系统 PATH。", silent);
                    return 1;
                }

                Directory.CreateDirectory(Path.Combine(root, ".runtime"));
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "\"" + serveScript + "\"",
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                psi.EnvironmentVariables["PORT"] = port.ToString();

                Process proc = Process.Start(psi);
                bool ready = false;
                for (int i = 0; i < 30; i++)
                {
                    Thread.Sleep(150);
                    HealthState state = ProbeHealth(healthUrl, 1000);
                    if (state.Status == HealthStatus.OwnRunning && PathsEqual(state.Root, root))
                    {
                        ready = true;
                        break;
                    }
                    if (state.Status == HealthStatus.ForeignPortInUse)
                    {
                        ShowError(port + " 端口已被其他应用占用，无法启动本工具。", silent);
                        return 1;
                    }
                    if (proc != null && proc.HasExited)
                    {
                        break;
                    }
                }

                if (!ready)
                {
                    ShowError("本地服务启动失败，请检查端口 " + port + " 或手动运行 node scripts\\serve.mjs 查看日志。", silent);
                    return 1;
                }
            }
            else if (!PathsEqual(existing.Root, root))
            {
                ShowError(port + " 端口正在运行另一目录的实例：\n" + existing.Root, silent);
                return 1;
            }

            if (!noBrowser)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = baseUrl,
                    UseShellExecute = true
                });
            }
            return 0;
        }
        catch (Exception ex)
        {
            ShowError("启动失败：\n" + ex.Message, silent);
            return 1;
        }
    }

    private enum HealthStatus
    {
        NotRunning,
        OwnRunning,
        ForeignPortInUse
    }

    private struct HealthState
    {
        public HealthStatus Status;
        public string Root;
        public int Pid;
    }

    private static HealthState ProbeHealth(string url, int timeoutMs)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "GET";
            req.Proxy = null;
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (Stream stream = resp.GetResponseStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
            {
                string body = reader.ReadToEnd();
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> json = serializer.Deserialize<Dictionary<string, object>>(body);
                if (json != null && json.ContainsKey("app") && string.Equals(Convert.ToString(json["app"]), AppId, StringComparison.Ordinal))
                {
                    return new HealthState
                    {
                        Status = HealthStatus.OwnRunning,
                        Root = json.ContainsKey("root") ? Convert.ToString(json["root"]) : string.Empty,
                        Pid = json.ContainsKey("pid") ? Convert.ToInt32(json["pid"]) : 0
                    };
                }
                return new HealthState { Status = HealthStatus.ForeignPortInUse };
            }
        }
        catch (WebException wex)
        {
            if (wex.Response != null)
            {
                wex.Response.Close();
                return new HealthState { Status = HealthStatus.ForeignPortInUse };
            }
            return new HealthState { Status = HealthStatus.NotRunning };
        }
        catch
        {
            return new HealthState { Status = HealthStatus.ForeignPortInUse };
        }
    }

    private static void StopServer(string root, string serveScript, bool silent)
    {
        string recordPath = Path.Combine(root, ".runtime", "server.json");
        if (!File.Exists(recordPath)) return;

        JavaScriptSerializer serializer = new JavaScriptSerializer();
        Dictionary<string, object> json = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(recordPath, Encoding.UTF8));
        if (json == null || !json.ContainsKey("pid")) return;

        int pid = Convert.ToInt32(json["pid"]);
        using (ManagementObjectSearcher searcher = new ManagementObjectSearcher("SELECT ProcessId, Name, CommandLine FROM Win32_Process WHERE ProcessId = " + pid))
        {
            foreach (ManagementObject obj in searcher.Get())
            {
                string name = Convert.ToString(obj["Name"] ?? string.Empty);
                string cmd = Convert.ToString(obj["CommandLine"] ?? string.Empty);
                if (string.Equals(name, "node.exe", StringComparison.OrdinalIgnoreCase) &&
                    cmd.IndexOf(serveScript, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    Process p = Process.GetProcessById(pid);
                    p.Kill();
                    p.WaitForExit(3000);
                }
            }
        }
    }

    private static string FindNodeExecutable()
    {
        string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (string dir in pathEnv.Split(';'))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            try
            {
                string candidate = Path.Combine(dir.Trim().Trim('"'), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }

        string[] fallbacks =
        {
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe")
        };
        foreach (string candidate in fallbacks)
        {
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static int ResolvePort()
    {
        string envPort = Environment.GetEnvironmentVariable("PORT");
        int parsed;
        if (!string.IsNullOrWhiteSpace(envPort) && int.TryParse(envPort.Trim(), out parsed) && parsed > 0 && parsed <= 65535)
        {
            return parsed;
        }
        return DefaultPort;
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return string.Empty;
        return Path.GetFullPath(path).TrimEnd('\\', '/');
    }

    private static bool PathsEqual(string a, string b)
    {
        return string.Equals(NormalizePath(a), NormalizePath(b), StringComparison.OrdinalIgnoreCase);
    }

    private static void ShowError(string message, bool silent)
    {
        if (silent)
        {
            Console.Error.WriteLine(message);
            return;
        }
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
