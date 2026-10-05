# Khôi phục CSDL từ bản sao lưu

Bản sao lưu do `scripts/backup.ps1` (Windows) hoặc `scripts/backup.sh` (Linux/macOS) tạo ra nằm trong thư mục `backups/`, định dạng `custom` của `pg_dump`. Tệp chứa dữ liệu cá nhân của học viên: chỉ sao chép qua kênh an toàn và xóa bản tạm sau khi dùng.

## Trước khi khôi phục

1. Dừng ứng dụng (`npm run dev` hoặc dịch vụ web) để không còn ai ghi dữ liệu.
2. Sao lưu trạng thái hiện tại thêm một lần, phòng khi chọn nhầm tệp: `./scripts/backup.sh` hoặc `.\scripts\backup.ps1`.
3. Xác định tệp cần khôi phục, ví dụ `backups/haxi_edu-20261005-230000.dump`.

## Khôi phục đè lên CSDL hiện tại

Lệnh dưới **xóa toàn bộ dữ liệu hiện có** trong CSDL `haxi_edu` rồi nạp lại từ bản sao lưu.

Linux/macOS:

```sh
docker compose exec -T db pg_restore -U haxi -d haxi_edu --clean --if-exists --no-owner --exit-on-error < backups/haxi_edu-20261005-230000.dump
```

Windows PowerShell (sao chép tệp vào container trước, vì PowerShell không chuyển hướng dữ liệu nhị phân an toàn):

```powershell
docker compose cp backups\haxi_edu-20261005-230000.dump db:/tmp/restore.dump
docker compose exec -T db pg_restore -U haxi -d haxi_edu --clean --if-exists --no-owner --exit-on-error /tmp/restore.dump
docker compose exec -T db rm -f /tmp/restore.dump
```

## Khôi phục thử sang CSDL khác (nên làm định kỳ)

Cách này không đụng tới dữ liệu đang chạy, dùng để kiểm tra bản sao lưu còn dùng được:

```sh
docker compose exec -T db createdb -U haxi haxi_edu_restore_test
docker compose exec -T db pg_restore -U haxi -d haxi_edu_restore_test --no-owner --exit-on-error < backups/haxi_edu-20261005-230000.dump
docker compose exec -T db psql -U haxi -d haxi_edu_restore_test -c "select count(*) from students; select count(*) from star_logs;"
docker compose exec -T db dropdb -U haxi haxi_edu_restore_test
```

## Sau khi khôi phục

1. Chạy `npm run db:migrate`. Nếu bản sao lưu cũ hơn mã nguồn, lệnh này áp dụng các migration còn thiếu.
2. Khởi động lại ứng dụng và đăng nhập kiểm tra: danh sách lớp, một buổi điểm danh gần nhất, tổng sao của vài học viên.
3. Người dùng đăng nhập lại bình thường. Thiết lập 2FA được giữ nguyên **nếu `BETTER_AUTH_SECRET` không đổi** (khóa TOTP được mã hóa bằng bí mật này). Nếu đã đổi bí mật, dùng "Đặt lại 2FA" ở trang Tài khoản.

## Lịch sao lưu gợi ý

- Hằng ngày, giữ 14 bản (mặc định của script). Windows: Task Scheduler chạy `powershell -File scripts\backup.ps1`. Linux: cron `0 2 * * * /duong/dan/scripts/backup.sh`.
- Sao chép thư mục `backups/` sang một nơi khác máy chủ (ổ ngoài hoặc lưu trữ có mã hóa).
- Lưu `BETTER_AUTH_SECRET` cùng chỗ an toàn với bản sao lưu; thiếu nó thì không dùng lại được thiết lập 2FA.
