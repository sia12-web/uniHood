Add-Type -AssemblyName System.Drawing

$inputPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.png"
$outputPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo-transparent.png"

# Load the image
$bmp = [System.Drawing.Bitmap]::FromFile($inputPath)

# Create a new bitmap for the transparent version
$newBmp = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height)
$g = [System.Drawing.Graphics]::FromImage($newBmp)
$g.DrawImage($bmp, 0, 0, $bmp.Width, $bmp.Height)

# Loop through pixels to make white transparent
# Using a small tolerance for off-white pixels
for ($x = 0; $x -lt $newBmp.Width; $x++) {
    for ($y = 0; $y -lt $newBmp.Height; $y++) {
        $pixel = $newBmp.GetPixel($x, $y)
        # Check for white or near-white (tolerance of 10)
        if ($pixel.R -ge 245 -and $pixel.G -ge 245 -and $pixel.B -ge 245) {
            $newBmp.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        }
    }
}

$newBmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp.Dispose()
$g.Dispose()
$newBmp.Dispose()

# Replace the original file
Remove-Item $inputPath
Rename-Item $outputPath $inputPath

Write-Host "Processed $inputPath to be transparent."
