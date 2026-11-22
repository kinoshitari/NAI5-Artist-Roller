$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$icoPath = Join-Path $PSScriptRoot 'app.ico'
$csPath = Join-Path $PSScriptRoot 'launcher.cs'
$exePath = Join-Path $root 'NAI5-Artist-Roller.exe'

function New-IconBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [double]$size
  $pad = [double][Math]::Max(1.0, [Math]::Round($s * 0.04))
  $outerRect = [System.Drawing.RectangleF]::new([float]$pad, [float]$pad, [float]($s - 2.0 * $pad), [float]($s - 2.0 * $pad))

  # RimWorld dark slate chassis (#15191D) + steel frame (#616C7A)
  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 25, 29))
  $g.FillRectangle($bgBrush, $outerRect)

  $outerBorderW = [double][Math]::Max(1.0, [Math]::Round($s * 0.045))
  $steelPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 97, 108, 122), [float]$outerBorderW)
  $steelPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
  $g.DrawRectangle($steelPen, $outerRect.X, $outerRect.Y, $outerRect.Width, $outerRect.Height)

  # Inner dark groove (#0D0A06)
  $inset = $pad + $outerBorderW + [double][Math]::Max(1.0, [Math]::Round($s * 0.045))
  $plateW = $s - 2.0 * $inset
  $plateRect = [System.Drawing.RectangleF]::new([float]$inset, [float]$inset, [float]$plateW, [float]$plateW)

  $darkOutline = [float][Math]::Max(1.0, [Math]::Round($s * 0.025))
  $grooveBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 10, 6))
  $g.FillRectangle($grooveBrush, [float]($plateRect.X - $darkOutline), [float]($plateRect.Y - $darkOutline), [float]($plateRect.Width + 2.0 * $darkOutline), [float]($plateRect.Height + 2.0 * $darkOutline))

  # RimWorld warm bronze beveled button plate (#6A512E)
  $plateBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $plateRect,
    [System.Drawing.Color]::FromArgb(255, 118, 91, 52),
    [System.Drawing.Color]::FromArgb(255, 88, 67, 38),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $g.FillRectangle($plateBrush, $plateRect)

  # 2px-style top/right highlight (#967744) & bottom/left shadow (#45341B)
  $bev = [float][Math]::Max(1.0, [Math]::Round($s * 0.055))
  $hiBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 150, 119, 68))
  $shBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 69, 52, 27))
  $g.FillRectangle($hiBrush, $plateRect.X, $plateRect.Y, $plateRect.Width, $bev)
  $g.FillRectangle($hiBrush, $plateRect.Right - $bev, $plateRect.Y, $bev, $plateRect.Height)
  $g.FillRectangle($shBrush, $plateRect.X, $plateRect.Bottom - $bev, $plateRect.Width, $bev)
  $g.FillRectangle($shBrush, $plateRect.X, $plateRect.Y, $bev, $plateRect.Height)

  # Recessed dark work-cell inner frame (#232426) for crisp dice pips
  $cellInset = $inset + [double]$bev + [double][Math]::Max(1.0, [Math]::Round($s * 0.06))
  $cellW = $s - 2.0 * $cellInset
  $cellRect = [System.Drawing.RectangleF]::new([float]$cellInset, [float]$cellInset, [float]$cellW, [float]$cellW)
  $cellBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 36, 38))
  $g.FillRectangle($cellBrush, $cellRect)
  $cellPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 135, 135, 135), [float][Math]::Max(1.0, [Math]::Round($s * 0.02)))
  $cellPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
  $g.DrawRectangle($cellPen, $cellRect.X, $cellRect.Y, $cellRect.Width, $cellRect.Height)

  # Five-pip artist-roller emblem: center main (#00E600), top-left/bottom-right sub (#FFE680), top-right/bottom-left accent (#CCB380)
  $cx = $cellRect.X + $cellRect.Width / 2.0
  $cy = $cellRect.Y + $cellRect.Height / 2.0
  $off = $cellRect.Width * 0.255
  $rCenter = $cellRect.Width * 0.135
  $rSide = $cellRect.Width * 0.105

  $mainBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 230, 0))
  $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 230, 128))
  $accBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 204, 179, 128))
  $pipShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 10, 12, 14))

  $pips = @(
    @{ x = $cx;        y = $cy;        r = $rCenter; brush = $mainBrush },
    @{ x = $cx - $off; y = $cy - $off; r = $rSide;   brush = $subBrush },
    @{ x = $cx + $off; y = $cy + $off; r = $rSide;   brush = $subBrush },
    @{ x = $cx + $off; y = $cy - $off; r = $rSide;   brush = $accBrush },
    @{ x = $cx - $off; y = $cy + $off; r = $rSide;   brush = $accBrush }
  )

  $shOff = [Math]::Max(0.5, $s * 0.015)
  foreach ($p in $pips) {
    $d = $p.r * 2.0
    $g.FillEllipse($pipShadow, [float]($p.x - $p.r), [float]($p.y - $p.r + $shOff), [float]$d, [float]$d)
    $g.FillEllipse($p.brush, [float]($p.x - $p.r), [float]($p.y - $p.r), [float]$d, [float]$d)
  }

  $g.Dispose()
  $bgBrush.Dispose(); $steelPen.Dispose(); $grooveBrush.Dispose(); $plateBrush.Dispose()
  $hiBrush.Dispose(); $shBrush.Dispose(); $cellBrush.Dispose(); $cellPen.Dispose()
  $mainBrush.Dispose(); $subBrush.Dispose(); $accBrush.Dispose(); $pipShadow.Dispose()
  return $bmp
}

$sizes = @(16, 24, 32, 48, 64, 256)
$pngBlobs = @()
foreach ($sz in $sizes) {
  $bmp = New-IconBitmap $sz
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBlobs += ,@{ Size = $sz; Data = $ms.ToArray() }
  $ms.Dispose()
  $bmp.Dispose()
}

# Write multi-resolution PNG-in-ICO
$icoStream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($icoStream)
$bw.Write([UInt16]0)                 # Reserved
$bw.Write([UInt16]1)                 # Type: ICO
$bw.Write([UInt16]$pngBlobs.Count)   # Image count

$offset = 6 + 16 * $pngBlobs.Count
foreach ($entry in $pngBlobs) {
  $dim = if ($entry.Size -ge 256) { [byte]0 } else { [byte]$entry.Size }
  $bw.Write($dim)                    # Width
  $bw.Write($dim)                    # Height
  $bw.Write([byte]0)                 # Color palette
  $bw.Write([byte]0)                 # Reserved
  $bw.Write([UInt16]1)               # Color planes
  $bw.Write([UInt16]32)              # Bits per pixel
  $bw.Write([UInt32]$entry.Data.Length)
  $bw.Write([UInt32]$offset)
  $offset += $entry.Data.Length
}
foreach ($entry in $pngBlobs) {
  $bw.Write($entry.Data)
}
$bw.Dispose()
$icoStream.Dispose()

# Compile WinExe launcher
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $csc)) { throw "未找到 csc.exe: $csc" }

& $csc /nologo /target:winexe /optimize+ /codepage:65001 /utf8output `
  "/win32icon:$icoPath" `
  "/out:$exePath" `
  /r:System.Windows.Forms.dll `
  /r:System.Web.Extensions.dll `
  /r:System.Management.dll `
  "$csPath"
if ($LASTEXITCODE -ne 0) { throw "编译失败，退出码 $LASTEXITCODE" }

# Create desktop shortcut
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'NAI5 画师调配台.lnk'
$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($shortcutPath)
$lnk.TargetPath = $exePath
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$exePath,0"
$lnk.Description = '启动 NAI5 画师调配台（本地 4173 端口）'
$lnk.Save()

Write-Output "ICON=$icoPath"
Write-Output "EXE=$exePath"
Write-Output "SHORTCUT=$shortcutPath"
