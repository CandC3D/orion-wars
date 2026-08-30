Add-Type -AssemblyName System.Drawing

$root = "C:\Users\chorr\Documents\triangle_campaign\assets\blender\renders\zandrax"
$out = Join-Path $root "sheets"
New-Item -ItemType Directory -Force $out | Out-Null

$ships = @(
    @{slug = "zandrax_frigate";        name = "ZANDRAX FRIGATE"},
    @{slug = "zandrax_destroyer";      name = "ZANDRAX DESTROYER"},
    @{slug = "zandrax_light_cruiser";  name = "ZANDRAX LIGHT CRUISER"},
    @{slug = "zandrax_heavy_cruiser";  name = "ZANDRAX HEAVY CRUISER"},
    @{slug = "zandrax_battleship";     name = "ZANDRAX BATTLESHIP"},
    @{slug = "zandrax_corvette"; name = "ZANDRAX CORVETTE"}
)
$cells = @(
    @{f = "front_quarter"; label = "FORWARD QUARTER"},
    @{f = "rear_quarter";  label = "REAR QUARTER"},
    @{f = "side";          label = "PROFILE"},
    @{f = "top";           label = "PLAN"},
    @{f = "stern_close";   label = "STERN"},
    @{f = "detail_bow";    label = "HEAD DETAIL"}
)

$cw = 800; $ch = 600; $header = 90; $pad = 6
$W = 2 * $cw + 3 * $pad
$H = $header + 3 * $ch + 4 * $pad

$titleFont = New-Object System.Drawing.Font("Arial", 30, [System.Drawing.FontStyle]::Bold)
$labelFont = New-Object System.Drawing.Font("Arial", 13, [System.Drawing.FontStyle]::Bold)
$white = [System.Drawing.Brushes]::White
$grey = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 150, 120))

foreach ($ship in $ships) {
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::FromArgb(12, 6, 5))
    $g.DrawString($ship.name, $titleFont, $white, 18, 20)
    $g.DrawString("ZANDRAX HORDE  -  VISUAL REFERENCE", $labelFont, $grey, 22, 62)

    for ($i = 0; $i -lt $cells.Count; $i++) {
        $col = $i % 2; $row = [math]::Floor($i / 2)
        $x = $pad + $col * ($cw + $pad)
        $y = $header + $pad + $row * ($ch + $pad)
        $src = Join-Path $root ("{0}_{1}.png" -f $ship.slug, $cells[$i].f)
        if (Test-Path $src) {
            $img = [System.Drawing.Image]::FromFile($src)
            $g.DrawImage($img, $x, $y, $cw, $ch)
            $img.Dispose()
        }
        $g.DrawString($cells[$i].label, $labelFont, $grey, $x + 10, $y + $ch - 28)
    }
    $g.Dispose()
    $dest = Join-Path $out ("{0}_sheet.png" -f $ship.slug)
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("SHEET " + $dest)
}
Write-Output "SHEETS_DONE"
