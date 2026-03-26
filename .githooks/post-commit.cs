using System;
using System.Diagnostics;
using System.Text;

internal static class Program
{
    private static int Main()
    {
        try
        {
            if (string.Equals(Environment.GetEnvironmentVariable("SKIP_AUTO_PUSH"), "1", StringComparison.Ordinal))
            {
                return 0;
            }

            var branchResult = RunGit("branch", "--show-current");
            var branch = branchResult.StdOut.Trim();
            if (string.IsNullOrWhiteSpace(branch))
            {
                return 0;
            }

            var remoteResult = RunGit("remote", "get-url", "origin");
            if (remoteResult.ExitCode != 0)
            {
                Console.Error.WriteLine("[post-commit] Skipping auto-push: remote 'origin' is not configured.");
                return 0;
            }

            var upstreamResult = RunGit("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
            var pushResult = upstreamResult.ExitCode == 0
                ? RunGit("push", "--quiet")
                : RunGit("push", "--quiet", "-u", "origin", branch);

            if (pushResult.ExitCode != 0)
            {
                if (!string.IsNullOrWhiteSpace(pushResult.StdErr))
                {
                    Console.Error.Write(pushResult.StdErr);
                }

                Console.Error.WriteLine("[post-commit] Auto-push failed; run 'git push' manually.");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[post-commit] Auto-push failed: " + ex.Message);
        }

        return 0;
    }

    private static GitResult RunGit(params string[] args)
    {
        var startInfo = new ProcessStartInfo("git")
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        startInfo.Arguments = BuildArguments(args);

        var process = Process.Start(startInfo);
        if (process == null)
        {
            throw new InvalidOperationException("Unable to start git.");
        }

        var stdOut = process.StandardOutput.ReadToEnd();
        var stdErr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        var exitCode = process.ExitCode;
        process.Dispose();

        return new GitResult(exitCode, stdOut, stdErr);
    }

    private static string BuildArguments(string[] args)
    {
        var builder = new StringBuilder();

        for (var i = 0; i < args.Length; i++)
        {
            if (i > 0)
            {
                builder.Append(' ');
            }

            builder.Append(QuoteArgument(args[i]));
        }

        return builder.ToString();
    }

    private static string QuoteArgument(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "\"\"";
        }

        if (value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0)
        {
            return value;
        }

        var builder = new StringBuilder();
        builder.Append('"');

        var slashCount = 0;
        foreach (var ch in value)
        {
            if (ch == '\\')
            {
                slashCount++;
                continue;
            }

            if (ch == '"')
            {
                builder.Append('\\', slashCount * 2 + 1);
                builder.Append(ch);
                slashCount = 0;
                continue;
            }

            if (slashCount > 0)
            {
                builder.Append('\\', slashCount);
                slashCount = 0;
            }

            builder.Append(ch);
        }

        if (slashCount > 0)
        {
            builder.Append('\\', slashCount * 2);
        }

        builder.Append('"');
        return builder.ToString();
    }

    private sealed class GitResult
    {
        public GitResult(int exitCode, string stdOut, string stdErr)
        {
            ExitCode = exitCode;
            StdOut = stdOut;
            StdErr = stdErr;
        }

        public int ExitCode { get; private set; }

        public string StdOut { get; private set; }

        public string StdErr { get; private set; }
    }
}
