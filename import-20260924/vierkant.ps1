Add-Type -AssemblyName System.Drawing
$bestemming = Join-Path $PSScriptRoot '../mobiel/product-images'
New-Item -ItemType Directory -Force $bestemming | Out-Null
$rapport = @()
foreach ($bestand in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.jpg') {
  $bron = [Drawing.Bitmap]::new($bestand.FullName)
  $zijde = [Math]::Max($bron.Width, $bron.Height)
  $x = [int][Math]::Floor(($zijde - $bron.Width) / 2)
  $y = [int][Math]::Floor(($zijde - $bron.Height) / 2)
  $doel = [Drawing.Bitmap]::new($zijde, $zijde, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($doel)
  $g.Clear([Drawing.Color]::White)
  $g.Dispose()
  # Controleer iedere originele pixel: geen crop, schaalwijziging of inhoudswijziging.
  for ($py=0; $py -lt $bron.Height; $py++) {
    for ($px=0; $px -lt $bron.Width; $px++) {
      $doel.SetPixel(($px+$x),($py+$y),$bron.GetPixel($px,$py))
      if ($bron.GetPixel($px,$py).ToArgb() -ne $doel.GetPixel(($px+$x),($py+$y)).ToArgb()) { throw "Afbeelding gewijzigd: $($bestand.Name)" }
    }
  }
  $doel.Save((Join-Path $bestemming ($bestand.BaseName+'.png')), [Drawing.Imaging.ImageFormat]::Png)
  $rapport += [pscustomobject]@{artikel=$bestand.BaseName;breedte=$bron.Width;hoogte=$bron.Height;vierkant=$zijde;pixelcontrole='identiek'}
  $bron.Dispose();$doel.Dispose()
}
$rapport | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot 'afbeelding-controle.json')
"$($rapport.Count) vierkante foto's gecontroleerd; oorspronkelijke pixels identiek."
