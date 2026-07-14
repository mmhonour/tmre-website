# Downsamples public/images/four-lens-camera.png into a tiny, transparency-
# preserving alternative at public/images/four-lens-camera-tiny.png.
# Aspect ratio is preserved; the longest side is capped at $maxSide.
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\make-camera-tiny.ps1

Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tmark\tmre-website\public\images\four-lens-camera.png"
$dstPath = "C:\Users\tmark\tmre-website\public\images\four-lens-camera-tiny.png"
$maxSide = 96

$orig = New-Object System.Drawing.Bitmap($srcPath)

$scale = [Math]::Min($maxSide / $orig.Width, $maxSide / $orig.Height)
$w = [Math]::Max(1, [int][Math]::Round($orig.Width * $scale))
$h = [Math]::Max(1, [int][Math]::Round($orig.Height * $scale))

$bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($orig, 0, 0, $w, $h)
$g.Dispose()
$orig.Dispose()

$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output ("Wrote {0}x{1} tiny icon to {2}" -f $w, $h, $dstPath)
