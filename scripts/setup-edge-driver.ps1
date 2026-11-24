$ErrorActionPreference = 'Stop'
# Prefer the installed WebView2 runtime over the browser version.
$webview = Get-ChildItem 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $webview) { throw 'Microsoft Edge WebView2 runtime not found' }
$version = $webview.Name
$destination = Join-Path $env:RUNNER_TEMP 'edge-driver'
New-Item -ItemType Directory -Force $destination | Out-Null
$zip = Join-Path $destination 'driver.zip'
Invoke-WebRequest "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip" -OutFile $zip
Expand-Archive $zip -DestinationPath $destination -Force
$destination | Out-File -FilePath $env:GITHUB_PATH -Append
