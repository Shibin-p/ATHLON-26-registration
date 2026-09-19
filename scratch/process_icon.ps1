Add-Type -AssemblyName System.Drawing

$srcPath = "c:\Users\shibi\OneDrive\Desktop\athlon26-registrations\pngwing.com.png"
$img = [System.Drawing.Bitmap]::FromFile($srcPath)

$minX = $img.Width
$minY = $img.Height
$maxX = 0
$maxY = 0

# Find non-transparent bounding box
for ($y = 0; $y -lt $img.Height; $y += 2) {
    for ($x = 0; $x -lt $img.Width; $x += 2) {
        $pixel = $img.GetPixel($x, $y)
        if ($pixel.A -gt 15) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Output "Bounding box: X=$minX..$maxX, Y=$minY..$maxY"

# Add a small 4% padding around the bounding box to keep it balanced
$w = $maxX - $minX
$h = $maxY - $minY
$padX = [int]($w * 0.04)
$padY = [int]($h * 0.04)

$cropX = [Math]::Max(0, $minX - $padX)
$cropY = [Math]::Max(0, $minY - $padY)
$cropW = [Math]::Min($img.Width - $cropX, $w + 2 * $padX)
$cropH = [Math]::Min($img.Height - $cropY, $h + 2 * $padY)

# Make square crop to prevent distortion
$side = [Math]::Max($cropW, $cropH)
$finalBmp = New-Object System.Drawing.Bitmap($side, $side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($finalBmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$offsetX = [int](($side - $cropW) / 2)
$offsetY = [int](($side - $cropH) / 2)
$srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$destRect = New-Object System.Drawing.Rectangle($offsetX, $offsetY, $cropW, $cropH)
$g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

# Create sizes: 64x64, 32x32, 192x192
function Resize-Image($source, $targetWidth, $targetHeight, $outPath) {
    $res = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gr = [System.Drawing.Graphics]::FromImage($res)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gr.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
    $gr.Dispose()
    $res.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $res.Dispose()
}

$pubDir = "c:\Users\shibi\OneDrive\Desktop\athlon26-registrations\public"
Resize-Image $finalBmp 64 64 "$pubDir\athlon-logo.png"
Resize-Image $finalBmp 32 32 "$pubDir\favicon.png"
Resize-Image $finalBmp 192 192 "$pubDir\apple-touch-icon.png"

# Also save directly to favicon.ico using standard ICO icon encoder or 32x32 PNG as ico
# Modern browsers accept 32x32 PNG formatted stream as favicon.ico
Copy-Item "$pubDir\favicon.png" "$pubDir\favicon.ico" -Force

$finalBmp.Dispose()
$img.Dispose()
Write-Output "Successfully generated optimized icons in $pubDir"
