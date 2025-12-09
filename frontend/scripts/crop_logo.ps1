Add-Type -AssemblyName System.Drawing

$inputPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.jpg"
$outputPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.png"

$bmp = [System.Drawing.Bitmap]::FromFile($inputPath)
$bmp.MakeTransparent([System.Drawing.Color]::White)

# Find bounding box
$minX = $bmp.Width
$minY = $bmp.Height
$maxX = 0
$maxY = 0

for ($x = 0; $x -lt $bmp.Width; $x++) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        $pixel = $bmp.GetPixel($x, $y)
        if ($pixel.A -ne 0) {
            # If not transparent
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

if ($maxX -lt $minX) {
    Write-Host "No non-transparent pixels found."
    exit
}

$width = $maxX - $minX + 1
$height = $maxY - $minY + 1
$rect = New-Object System.Drawing.Rectangle($minX, $minY, $width, $height)

$cropped = $bmp.Clone($rect, $bmp.PixelFormat)
$cropped.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp.Dispose()
$cropped.Dispose()

Write-Host "Cropped and saved transparent image to $outputPath"
