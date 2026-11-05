[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$XmlPath,
    [Parameter(Mandatory)][string]$ImageDirectory,
    [string]$DatasetDirectory = (Join-Path $PSScriptRoot '..\dataset'),
    [int[]]$ValidationIndices = @(2, 8, 16, 21),
    [int[]]$TestIndices = @(4, 13, 24),
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$datasetRoot = [IO.Path]::GetFullPath($DatasetDirectory)
$xml = [xml][IO.File]::ReadAllText((Resolve-Path -LiteralPath $XmlPath))
$records = @($xml.annotations.image)
if (-not $records.Count) { throw 'XML không chứa image annotations.' }
$sourceFiles = @(Get-ChildItem -LiteralPath $ImageDirectory -File -Recurse)
$classNames = @($xml.annotations.meta.job.labels.label.name)
if ($classNames.Count -ne 1 -or $classNames[0] -ne 'hole_inner') {
    throw "Cần đúng một class hole_inner; XML hiện có: $($classNames -join ', ')"
}
foreach ($split in @('train', 'val', 'test')) {
    [IO.Directory]::CreateDirectory((Join-Path $datasetRoot "images\$split")) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $datasetRoot "labels\$split")) | Out-Null
}
$summary = [ordered]@{ train = 0; val = 0; test = 0; polygons = 0; negative_images = 0 }
for ($index = 0; $index -lt $records.Count; $index++) {
    $record = $records[$index]
    $matches = @($sourceFiles | Where-Object Name -eq ([string]$record.name))
    if ($matches.Count -ne 1) { throw "Ảnh '$($record.name)' có $($matches.Count) file khớp; cần đúng 1." }
    $width = [double]$record.width; $height = [double]$record.height
    if ($width -le 0 -or $height -le 0) { throw "Kích thước ảnh không hợp lệ: $($record.name)" }
    $split = if ($TestIndices -contains $index) { 'test' } elseif ($ValidationIndices -contains $index) { 'val' } else { 'train' }
    $imageTarget = Join-Path $datasetRoot "images\$split\$($record.name)"
    $labelTarget = Join-Path $datasetRoot "labels\$split\$([IO.Path]::GetFileNameWithoutExtension([string]$record.name)).txt"
    if (-not $Force -and ((Test-Path -LiteralPath $imageTarget) -or (Test-Path -LiteralPath $labelTarget))) {
        throw "Target đã tồn tại: $($record.name). Dùng -Force nếu thực sự muốn ghi đè."
    }
    $lines = [Collections.Generic.List[string]]::new()
    foreach ($polygon in @($record.polygon)) {
        if ([string]$polygon.label -ne 'hole_inner') { continue }
        $coords = [Collections.Generic.List[string]]::new()
        foreach ($pair in ([string]$polygon.points -split ';')) {
            $xy = $pair -split ','
            if ($xy.Count -ne 2) { throw "Điểm polygon lỗi trong $($record.name): $pair" }
            $x = [double]::Parse($xy[0], [Globalization.CultureInfo]::InvariantCulture) / $width
            $y = [double]::Parse($xy[1], [Globalization.CultureInfo]::InvariantCulture) / $height
            if ($x -lt 0 -or $x -gt 1 -or $y -lt 0 -or $y -gt 1) { throw "Điểm ngoài [0,1] trong $($record.name)" }
            $coords.Add($x.ToString('0.########', [Globalization.CultureInfo]::InvariantCulture))
            $coords.Add($y.ToString('0.########', [Globalization.CultureInfo]::InvariantCulture))
        }
        if ($coords.Count -lt 6) { throw "Polygon dưới 3 điểm trong $($record.name)" }
        $lines.Add('0 ' + ($coords -join ' ')); $summary.polygons++
    }
    if (-not $lines.Count) { $summary.negative_images++ }
    Copy-Item -LiteralPath $matches[0].FullName -Destination $imageTarget -Force:$Force
    [IO.File]::WriteAllLines($labelTarget, $lines, [Text.UTF8Encoding]::new($false))
    $summary[$split]++
}
$manifest = [ordered]@{
    source_xml = [IO.Path]::GetFullPath($XmlPath)
    source_images = [IO.Path]::GetFullPath($ImageDirectory)
    split_note = 'Prototype split rải đều trong một phiên chụp; cần test bằng phiên chụp độc lập trước khi đánh giá chính thức.'
    validation_indices_zero_based = $ValidationIndices
    test_indices_zero_based = $TestIndices
    counts = $summary
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $datasetRoot 'split_manifest.json') -Encoding utf8NoBOM
$summary | ConvertTo-Json
