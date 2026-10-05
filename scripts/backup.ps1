# Sao lưu CSDL PostgreSQL đang chạy bằng Docker Compose (Windows PowerShell).
# Dùng:  .\scripts\backup.ps1            -> tạo backups\haxi_edu-<ngày giờ>.dump
#        .\scripts\backup.ps1 -Keep 30   -> giữ lại 30 bản mới nhất
# Tệp sao lưu chứa dữ liệu cá nhân của học viên: lưu ở nơi an toàn, không commit lên git.
param([int]$Keep = 14)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "backups"
New-Item -ItemType Directory -Force $dir | Out-Null

$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "haxi" }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "haxi_edu" }
$name = "$dbName-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
$file = Join-Path $dir $name
$inContainer = "/tmp/$name"

Push-Location $root
try {
  # Ghi tệp bên trong container rồi sao chép ra, tránh PowerShell làm hỏng dữ liệu nhị phân khi chuyển hướng.
  docker compose exec -T db pg_dump -U $dbUser -d $dbName --format=custom --no-owner --file=$inContainer
  if ($LASTEXITCODE -ne 0) { throw "pg_dump thất bại (mã $LASTEXITCODE)" }
  docker compose cp "db:$inContainer" $file
  if ($LASTEXITCODE -ne 0) { throw "Không sao chép được tệp sao lưu ra khỏi container" }
  docker compose exec -T db rm -f $inContainer
} finally {
  Pop-Location
}

if ((Get-Item $file).Length -lt 1024) { throw "Tệp sao lưu quá nhỏ, có thể đã lỗi: $file" }
Write-Host "Đã sao lưu: $file ($([math]::Round((Get-Item $file).Length / 1KB)) KB)"

# Xóa các bản cũ trong thư mục backups, giữ lại $Keep bản mới nhất.
$old = Get-ChildItem -Path $dir -Filter "$dbName-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
foreach ($item in $old) { Remove-Item -LiteralPath $item.FullName -Force }
