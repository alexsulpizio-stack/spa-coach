$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = $null
$port = $null

function Get-ContentType([string]$path) {
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    switch ($ext) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css' { return 'text/css; charset=utf-8' }
        '.js' { return 'application/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.webmanifest' { return 'application/manifest+json; charset=utf-8' }
        '.svg' { return 'image/svg+xml' }
        '.png' { return 'image/png' }
        '.jpg' { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.ico' { return 'image/x-icon' }
        '.txt' { return 'text/plain; charset=utf-8' }
        default { return 'application/octet-stream' }
    }
}

function Write-HttpResponse($stream, [int]$statusCode, [string]$statusText, [string]$contentType, [byte[]]$body, [bool]$headOnly) {
    $header = "HTTP/1.1 $statusCode $statusText`r`n" +
              "Content-Type: $contentType`r`n" +
              "Content-Length: $($body.Length)`r`n" +
              "Cache-Control: no-store, max-age=0`r`n" +
              "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $headOnly -and $body.Length -gt 0) {
        $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
}

# Find a free port automatically. This avoids failures when an older Spa Coach
# window is still using 8080.
foreach ($candidatePort in 8080..8099) {
    $candidateListener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $candidatePort)
    try {
        $candidateListener.Start()
        $listener = $candidateListener
        $port = $candidatePort
        break
    } catch {
        try { $candidateListener.Stop() } catch {}
    }
}

if ($null -eq $listener -or $null -eq $port) {
    Write-Host ''
    Write-Host 'Could not find a free port from 8080 through 8099.' -ForegroundColor Red
    Write-Host 'Close older Spa Coach server windows and try again.'
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}

$addresses = @()
try {
    $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
        Where-Object {
            $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
            -not [System.Net.IPAddress]::IsLoopback($_) -and
            -not $_.ToString().StartsWith('169.254.')
        } |
        ForEach-Object { $_.ToString() } |
        Select-Object -Unique
} catch {}

Clear-Host
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '              SPA COACH PHONE v0.4.0' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "Spa Coach PHONE v0.4.0 is running on port $port." -ForegroundColor Green
if ($port -ne 8080) {
    Write-Host "Port 8080 was busy, so Spa Coach automatically switched to $port." -ForegroundColor Yellow
}
Write-Host ''
Write-Host '1. Keep this window open.'
Write-Host '2. Put your phone on the SAME Wi-Fi as this PC.'
Write-Host '3. On your phone, open one of these addresses:'
Write-Host ''
if ($addresses.Count -gt 0) {
    foreach ($addr in $addresses) {
        Write-Host "   http://${addr}:$port" -ForegroundColor Yellow
    }
} else {
    Write-Host "   Could not detect the PC's Wi-Fi address automatically." -ForegroundColor Yellow
    Write-Host '   Run ipconfig and use the IPv4 Address shown for Wi-Fi.'
    Write-Host "   Example: http://192.168.1.25:$port"
}
Write-Host ''
Write-Host "On this PC: http://localhost:$port"
Write-Host ''
Write-Host 'If Windows Firewall asks, allow Windows PowerShell on PRIVATE networks.' -ForegroundColor DarkYellow
Write-Host 'Press Ctrl+C to stop Spa Coach.' -ForegroundColor DarkGray
Write-Host ''

$rootFull = [System.IO.Path]::GetFullPath($root)
if (-not $rootFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootFull += [System.IO.Path]::DirectorySeparatorChar
}

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
        $client.ReceiveTimeout = 5000
        $client.SendTimeout = 5000
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)

        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            $client.Close()
            continue
        }

        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
        }

        $parts = $requestLine.Split(' ')
        if ($parts.Length -lt 2) {
            $body = [System.Text.Encoding]::UTF8.GetBytes('Bad Request')
            Write-HttpResponse $stream 400 'Bad Request' 'text/plain; charset=utf-8' $body $false
            $client.Close()
            continue
        }

        $method = $parts[0].ToUpperInvariant()
        $target = $parts[1]
        $headOnly = ($method -eq 'HEAD')
        if ($method -ne 'GET' -and $method -ne 'HEAD') {
            $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
            Write-HttpResponse $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body $false
            $client.Close()
            continue
        }

        $pathOnly = $target.Split('?')[0]
        try { $pathOnly = [System.Uri]::UnescapeDataString($pathOnly) } catch {}
        if ($pathOnly -eq '/' -or [string]::IsNullOrWhiteSpace($pathOnly)) {
            $pathOnly = '/index.html'
        }

        $relative = $pathOnly.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

        if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
            Write-HttpResponse $stream 404 'Not Found' 'text/plain; charset=utf-8' $body $headOnly
        } else {
            $body = [System.IO.File]::ReadAllBytes($candidate)
            $contentType = Get-ContentType $candidate
            Write-HttpResponse $stream 200 'OK' $contentType $body $headOnly
        }
    } catch {
        # Ignore individual browser connection errors and keep serving.
    } finally {
        if ($client -ne $null) {
            try { $client.Close() } catch {}
        }
    }
}
