#!/usr/bin/env sh
# Sao lưu CSDL PostgreSQL đang chạy bằng Docker Compose (Linux/macOS).
# Dùng:  ./scripts/backup.sh         -> tạo backups/haxi_edu-<ngày giờ>.dump
#        KEEP=30 ./scripts/backup.sh -> giữ lại 30 bản mới nhất
# Tệp sao lưu chứa dữ liệu cá nhân của học viên: lưu ở nơi an toàn, không commit lên git.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/backups"
DB_USER="${POSTGRES_USER:-haxi}"
DB_NAME="${POSTGRES_DB:-haxi_edu}"
KEEP="${KEEP:-14}"
FILE="$DIR/$DB_NAME-$(date +%Y%m%d-%H%M%S).dump"

mkdir -p "$DIR"
chmod 700 "$DIR"
cd "$ROOT"
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner > "$FILE"
chmod 600 "$FILE"

if [ "$(wc -c < "$FILE")" -lt 1024 ]; then
  echo "Tệp sao lưu quá nhỏ, có thể đã lỗi: $FILE" >&2
  exit 1
fi
echo "Đã sao lưu: $FILE"

# Xóa các bản cũ trong thư mục backups, giữ lại $KEEP bản mới nhất.
ls -1t "$DIR"/"$DB_NAME"-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
done
