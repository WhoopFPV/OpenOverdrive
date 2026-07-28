$BaseFolderRelative = "Internal shared storage\Android\data\com.anki.overdrive\files\expansion\assets"
$ScriptDir          = $PSScriptRoot
$TempDir            = Join-Path -Path $ScriptDir -ChildPath "temp"

if (-not (Test-Path -Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir | Out-Null
}

Write-Host "Searching for connected mobile devices..." -ForegroundColor Yellow

$shell = New-Object -ComObject Shell.Application
$myComputer = $shell.NameSpace(17)

$phone = $myComputer.Items() | Where-Object { 
    $_.Type -like "*Portable Device*" -or 
    $_.Type -like "*Media Player*" -or 
    $_.Type -like "*Phone*" -or
    $_.Path -like "*\\?\usb*"
} | Select-Object -First 1

if (-not $phone) {
    $phone = $myComputer.Items() | Where-Object { $_.IsFileSystem -eq $false -and $_.IsFolder -eq $true } | Select-Object -First 1
}

if (-not $phone) {
    Write-Host "No phone found! Make sure it is connected via USB in File Transfer/MTP mode." -ForegroundColor Red
    pause
    exit
}

Write-Host "Found device: $($phone.Name)" -ForegroundColor Cyan

function Get-MTPFolder {
    param ($RootFolder, $RelativePath)
    $current = $RootFolder
    foreach ($part in $RelativePath.Split('\')) {
        if ($part) {
            $current = $current.GetFolder.Items() | Where-Object { $_.Name -eq $part }
            if (-not $current) { return $null }
        }
    }
    return $current
}

$baseAssetsFolder = Get-MTPFolder -RootFolder $phone -RelativePath $BaseFolderRelative

if (-not $baseAssetsFolder) {
    Write-Host "Target assets path could not be opened on the device." -ForegroundColor Red
    pause
    exit
}

$TargetMap = @(
    @{ SubPath = ""; RelativeDir = ""; FileName = "server_config.json" },
    @{ SubPath = ""; RelativeDir = ""; FileName = "rams_config.json" },
    @{ SubPath = "rams\od-chapter-1"; RelativeDir = "rams_od-chapter-1"; FileName = "manifest.json" },
    @{ SubPath = "rams\od-chapter-2"; RelativeDir = "rams_od-chapter-2"; FileName = "manifest.json" },
    @{ SubPath = "rams\overdrive"; RelativeDir = "rams_overdrive"; FileName = "catalog.json" }
)

Write-Host "Pulling configuration files from phone..." -ForegroundColor Yellow

foreach ($item in $TargetMap) {
    if ([string]::IsNullOrEmpty($item.SubPath)) {
        $mtpFolder = $baseAssetsFolder
        $displayPath = $item.FileName
    } else {
        $mtpFolder = Get-MTPFolder -RootFolder $baseAssetsFolder -RelativePath $item.SubPath
        $displayPath = Join-Path -Path $item.SubPath -ChildPath $item.FileName
    }

    if (-not $mtpFolder) {
        Write-Host " Warning: Folder '$($item.SubPath)' not found on phone!" -ForegroundColor Yellow
        continue
    }

    if ([string]::IsNullOrEmpty($item.RelativeDir)) {
        $localSubDir = $TempDir
    } else {
        $localSubDir = Join-Path -Path $TempDir -ChildPath $item.RelativeDir
    }

    if (-not (Test-Path -Path $localSubDir)) {
        New-Item -ItemType Directory -Path $localSubDir | Out-Null
    }

    $targetFile = $mtpFolder.GetFolder.Items() | Where-Object { $_.Name -eq $item.FileName }
    if ($targetFile) {
        $destFolder = $shell.NameSpace($localSubDir)
        $destFolder.CopyHere($targetFile, 16)
        Write-Host " Pulled: $displayPath" -ForegroundColor Green
    } else {
        Write-Host " Warning: '$($item.FileName)' not found in '$($item.SubPath)' on phone!" -ForegroundColor Yellow
    }
}

Start-Sleep -Seconds 2

Write-Host ""
$NewIP = Read-Host "Enter the new IP address (e.g., 192.168.1.50)"

$CleanIP = $NewIP.Trim().Replace("http://", "").Replace("https://", "")
$ReplacementURL = "http://$CleanIP"

Write-Host "Target IP set to: $CleanIP (Full URL: $ReplacementURL)" -ForegroundColor Cyan
Write-Host ""

$ServerConfigFile = Join-Path -Path $TempDir -ChildPath "server_config.json"
if (Test-Path -Path $ServerConfigFile) {
    $AnkiURLs = @(
        "https://virtualrewards.api.anki.com",
        "https://storegate.api.anki.com",
        "https://ankival.api.anki.com",
        "https://accounts.api.anki.com"
    )
    $bytes = [System.IO.File]::ReadAllBytes($ServerConfigFile)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    $modified = $false

    foreach ($url in $AnkiURLs) {
        if ($content.Contains($url)) {
            $content = $content.Replace($url, $ReplacementURL)
            $modified = $true
        }
    }

    if ($modified) {
        [System.IO.File]::WriteAllBytes($ServerConfigFile, [System.Text.Encoding]::UTF8.GetBytes($content))
        Write-Host "Patched server_config.json" -ForegroundColor Green
    }
}

$RamsConfigFile = Join-Path -Path $TempDir -ChildPath "rams_config.json"
if (Test-Path -Path $RamsConfigFile) {
    $bytes = [System.IO.File]::ReadAllBytes($RamsConfigFile)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    $modified = $false

    if ($content.Contains("prod-rams.anki.com")) {
        $content = $content.Replace("prod-rams.anki.com", $CleanIP)
        $modified = $true
    }
    if ($content.Contains("https")) {
        $content = $content.Replace("https", "http")
        $modified = $true
    }

    if ($modified) {
        [System.IO.File]::WriteAllBytes($RamsConfigFile, [System.Text.Encoding]::UTF8.GetBytes($content))
        Write-Host "Patched rams_config.json" -ForegroundColor Green
    }
}

$ManifestFolders = @("rams_od-chapter-1", "rams_od-chapter-2")
foreach ($folder in $ManifestFolders) {
    $manifestFile = Join-Path -Path (Join-Path -Path $TempDir -ChildPath $folder) -ChildPath "manifest.json"
    if (Test-Path -Path $manifestFile) {
        $bytes = [System.IO.File]::ReadAllBytes($manifestFile)
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        
        if ($content.Contains("https://prod-rams.anki.com")) {
            $content = $content.Replace("https://prod-rams.anki.com", $ReplacementURL)
            [System.IO.File]::WriteAllBytes($manifestFile, [System.Text.Encoding]::UTF8.GetBytes($content))
            Write-Host "Patched $folder\manifest.json" -ForegroundColor Green
        }
    }
}

$CatalogFile = Join-Path -Path (Join-Path -Path $TempDir -ChildPath "rams_overdrive") -ChildPath "catalog.json"
if (Test-Path -Path $CatalogFile) {
    $bytes = [System.IO.File]::ReadAllBytes($CatalogFile)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    $modified = $false

    if ($content.Contains("prod-rams.anki.com")) {
        $content = $content.Replace("prod-rams.anki.com", $CleanIP)
        $modified = $true
    }
    if ($content.Contains("https")) {
        $content = $content.Replace("https", "http")
        $modified = $true
    }

    if ($modified) {
        [System.IO.File]::WriteAllBytes($CatalogFile, [System.Text.Encoding]::UTF8.GetBytes($content))
        Write-Host "Patched rams/overdrive/catalog.json" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Pushing patched files back to phone..." -ForegroundColor Yellow

foreach ($item in $TargetMap) {
    if ([string]::IsNullOrEmpty($item.RelativeDir)) {
        $localSubDir = $TempDir
        $displayPath = $item.FileName
    } else {
        $localSubDir = Join-Path -Path $TempDir -ChildPath $item.RelativeDir
        $displayPath = Join-Path -Path $item.SubPath -ChildPath $item.FileName
    }

    $localFilePath = Join-Path -Path $localSubDir -ChildPath $item.FileName
    if (-not (Test-Path -Path $localFilePath)) { continue }

    if ([string]::IsNullOrEmpty($item.SubPath)) {
        $mtpFolder = $baseAssetsFolder
    } else {
        $mtpFolder = Get-MTPFolder -RootFolder $baseAssetsFolder -RelativePath $item.SubPath
    }

    if (-not $mtpFolder) { continue }

    $existingPhoneFile = $mtpFolder.GetFolder.Items() | Where-Object { $_.Name -eq $item.FileName }
    if ($existingPhoneFile) {
        $deleteVerb = $existingPhoneFile.Verbs() | Where-Object { $_.Name -match 'Delete' -or $_.Name -match 'delete' }
        if ($deleteVerb) {
            $deleteVerb.DoIt()
        } else {
            $existingPhoneFile.InvokeVerb("delete")
        }
        Start-Sleep -Seconds 1
    }

    $itemToCopy = $shell.NameSpace($localSubDir).ParseName($item.FileName)
    if ($itemToCopy) {
        $mtpFolder.GetFolder.CopyHere($itemToCopy, 16)
        Write-Host " Pushed patched $displayPath" -ForegroundColor Green
    }
}

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "All done! All configuration and manifest files have been patched and updated on your phone." -ForegroundColor Green
pause