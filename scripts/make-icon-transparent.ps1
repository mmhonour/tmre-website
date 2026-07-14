# Keys the solid-magenta background out of the generated camera icon and writes
# a transparent PNG to public/images/tmre-camera-icon.png.
#
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts\make-icon-transparent.ps1

Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tmark\.cursor\projects\c-Users-tmark-tmre-website\assets\tmre-camera-icon-magenta.png"
$dstPath = "C:\Users\tmark\tmre-website\public\images\tmre-camera-icon.png"
$size = 512

$orig = New-Object System.Drawing.Bitmap($srcPath)
$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($orig, 0, 0, $size, $size)
$g.Dispose()
$orig.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$len = $size * $size * 4
$buf = New-Object byte[] $len
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $len)

# Pixels are stored BGRA. "magentaness" = avg(R,B) - G, which is high only for
# the magenta backdrop (silver, black glass and white glints all score ~0).
for ($i = 0; $i -lt $len; $i += 4) {
  $b = $buf[$i]
  $gr = $buf[$i + 1]
  $r = $buf[$i + 2]
  $m = (($r + $b) / 2) - $gr
  if ($m -ge 120) {
    $buf[$i + 3] = 0
  }
  elseif ($m -gt 40) {
    $a = [int](255 * (120 - $m) / 80)
    if ($a -lt 0) { $a = 0 }
    if ($a -gt 255) { $a = 255 }
    $buf[$i + 3] = [byte]$a
    # Spill suppression: kill the pink fringe by clamping R/B down to G.
    if ($r -gt $gr) { $buf[$i + 2] = [byte]$gr }
    if ($b -gt $gr) { $buf[$i] = [byte]$gr }
  }
}

[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $len)
$bmp.UnlockBits($data)
$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "Wrote transparent icon to $dstPath"
