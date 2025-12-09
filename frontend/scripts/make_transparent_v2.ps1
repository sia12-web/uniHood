Add-Type -AssemblyName System.Drawing

$inputPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.png"
$outputPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo-transparent.png"
$backupPath = "c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.backup.png"

# Backup original if not exists
if (-not (Test-Path $backupPath)) {
    Copy-Item $inputPath $backupPath
}

# Load the image
$bmp = [System.Drawing.Bitmap]::FromFile($inputPath)

# Create a new bitmap for the transparent version
$newBmp = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height)
$g = [System.Drawing.Graphics]::FromImage($newBmp)
$g.DrawImage($bmp, 0, 0, $bmp.Width, $bmp.Height)

# Process
for ($x = 0; $x -lt $newBmp.Width; $x++) {
    for ($y = 0; $y -lt $newBmp.Height; $y++) {
        $pixel = $newBmp.GetPixel($x, $y)
        
        # AGGRESIVE TOLERANCE: any pixel where all channels are > 200 is considered "background"
        # This eats into light shadows and anti-aliasing to remove the "box"
        if ($pixel.R -ge 200 -and $pixel.G -ge 200 -and $pixel.B -ge 200) {
            $newBmp.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        }
    }
}

$newBmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp.Dispose()
$g.Dispose()
$newBmp.Dispose()

# Force replace
Remove-Item $inputPath -Force
Move-Item $outputPath $inputPath -Force

Write-Host "Processed with high tolerance."
