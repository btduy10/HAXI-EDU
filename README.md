# HAXI Robotics — Hệ thống quản lý Trung tâm Robotics

Ứng dụng web cho trung tâm dạy Robotics: quản lý giáo viên, học viên, lớp, thời khóa biểu, điểm danh, chấm sao, avatar game hóa và tổng kết tặng quà. Hai loại tài khoản: **Quản trị (Admin)** và **Giáo viên (GV)**. Học viên và phụ huynh không có tài khoản.

> **Tiến độ:** đã xong **Giai đoạn 1 – Nền tảng**, **Giai đoạn 2 – TKB & điểm danh** và **Giai đoạn 3 – Sao & avatar**. Giai đoạn 4 (cuối khóa & báo cáo, xuất PDF/Excel, nhật ký, sao lưu) chưa làm.

## Công nghệ

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS + shadcn/ui · PostgreSQL 17 + Drizzle ORM · Better Auth (tên đăng nhập + TOTP) · Zod · Vitest · Playwright.

## Chạy trên máy

Yêu cầu: Node.js 22+ và Docker Desktop.

```bash
cp .env.example .env          # rồi đặt BETTER_AUTH_SECRET (lệnh tạo có ghi trong tệp)
docker compose up -d          # PostgreSQL ở cổng 5432, kèm CSDL test haxi_edu_test
npm install
npm run db:migrate            # tạo bảng
npm run db:seed               # dữ liệu mẫu (chỉ chạy khi CSDL chưa có tài khoản)
npm run dev                   # http://localhost:3000
```

### Tài khoản demo

| Tên đăng nhập | Vai trò | Ghi chú |
|---|---|---|
| `admin` | Quản trị | Sau khi đổi mật khẩu phải thiết lập xác thực hai lớp (TOTP) |
| `gv.lan` | Giáo viên | Dạy lớp RB-CB01 |
| `gv.minh` | Giáo viên | Dạy lớp RB-NC01 |

Mật khẩu tạm là giá trị `SEED_DEFAULT_PASSWORD` trong `.env` (mặc định `Haxi@2026`). Lần đăng nhập đầu **bắt buộc đổi mật khẩu** (tối thiểu 10 ký tự, có chữ và số). Dữ liệu mẫu gồm 2 lớp (mỗi lớp 2 buổi/tuần, đã sinh buổi học; các buổi cũ hơn 7 ngày đã điểm danh sẵn), 15 học viên, 2 phòng, 3 ca học, 5 cấp bậc, các tiêu chí sao, 15 avatar và một số lần ghi sao. Với CSDL đã có dữ liệu, chạy lại `npm run db:seed` chỉ bổ sung kho avatar còn thiếu.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Sinh kiểu route của Next rồi chạy `tsc` |
| `npm test` | Vitest: test đơn vị + test tích hợp trên CSDL `haxi_edu_test` (tự dựng lại schema) |
| `npm run test:e2e` | Playwright ở màn hình 360px, tự chạy server riêng (cổng 3100) trên CSDL test. Lần đầu cần `npx playwright install chromium` |
| `npm run db:generate` | Sinh migration sau khi sửa `src/db/schema` |
| `npm run db:migrate` / `db:seed` | Áp dụng migration / nạp dữ liệu mẫu |

## Cấu trúc

```
src/
  proxy.ts              CSP theo nonce, header bảo mật, ép HTTPS, chặn sớm khi chưa đăng nhập
  app/(auth)            Đăng nhập, xác thực hai lớp, đổi mật khẩu
  app/(admin)/admin     Trang quản trị
  app/(teacher)/teacher Trang giáo viên
  app/api               Better Auth, nhập Excel
  db/schema             Schema Drizzle (migration ở ./drizzle)
  domain                Quy tắc nghiệp vụ thuần, không phụ thuộc CSDL
  server/services       Nghiệp vụ + PHÂN QUYỀN (nơi duy nhất quyết định ai được làm gì)
  server/actions        Server Action: chỉ là vỏ (phiên → Zod → service)
  lib/validation        Schema Zod
tests/unit · tests/integration · tests/e2e
```

Nguyên tắc: mọi hàm trong `server/services` nhận `actor` lấy từ phiên ở máy chủ và tự kiểm tra quyền. Giao diện chỉ ẩn/hiện cho tiện, không phải lớp bảo vệ.

## Đã có ở Giai đoạn 1

- Đăng nhập bằng tên đăng nhập, băm Argon2id, buộc đổi mật khẩu lần đầu, khóa tạm sau 5 lần sai (15 phút), giới hạn tốc độ.
- 2FA (TOTP) bắt buộc với Admin, có mã dự phòng.
- Admin: Tổng quan, Học viên (tìm kiếm, nhập Excel có xem trước và báo lỗi từng dòng), Giáo viên, Khóa học, Lớp học (phân công GV), Phòng & Ca học & Ngày nghỉ, Ghi danh (chặn vượt sĩ số, giữ lịch sử rời lớp), Tài khoản (tạo, đặt lại mật khẩu, khóa/mở, đặt lại 2FA).
- GV: Tổng quan, Lớp của tôi, danh sách học viên của lớp mình (chỉ các trường tối thiểu).
- Nhật ký `audit_logs` cho đăng nhập, thay đổi tài khoản và mọi thao tác tạo/sửa/xóa.
- Toàn bộ schema CSDL cho cả 4 giai đoạn (kể cả trigger khiến sổ cái sao chỉ thêm được).

## Đã có ở Giai đoạn 2

- **Lịch mẫu & sinh buổi:** mỗi lớp nhiều dòng lịch mỗi tuần (thứ + ca, có thể đặt giờ/phòng/GV riêng). Sinh buổi trong khoảng ngày của lớp, bỏ ngày nghỉ toàn trung tâm và ngày nghỉ riêng của lớp. Chạy lại không tạo trùng, không ghi đè buổi đã sửa.
- **Giờ riêng từng buổi:** giờ được sao chép từ ca lúc sinh; sửa một buổi không đổi ca gốc hay buổi khác, sửa ca không đổi buổi đã sinh.
- **Trùng lịch:** so theo khoảng giờ thực tế của GV thực dạy (đã tính dạy thay) và phòng. Trùng thì **chặn**; vượt sức chứa phòng thì **cảnh báo** nhưng vẫn lưu. Hai buổi nối tiếp nhau (09:30 kết thúc, 09:30 bắt đầu) không tính là trùng.
- **Điều chỉnh:** dời buổi (giữ ngày gốc), hủy/khôi phục, GV dạy thay (lưu cả GV gốc và GV thay), buổi bù chỉ gồm học viên được chọn.
- **Thời khóa biểu:** lưới tuần thứ × ca và lịch tháng; Admin lọc theo GV/lớp/phòng; GV chỉ thấy lịch của mình. Trên điện thoại hiển thị theo ngày.
- **Điểm danh trên điện thoại:** danh sách chỉ gồm học viên đang ghi danh tại ngày học, mặc định "Có mặt", lưu cả lớp một lần. Mọi lần sửa ghi vào `audit_logs` kèm giá trị cũ và mới.
- **Khóa sửa điểm danh:** sau 7 ngày (`attendance_lock_days` trong bảng `app_settings`). Chỉ Admin mở khóa, mỗi lần 24 giờ, có ghi nhật ký; kể cả Admin cũng phải mở khóa trước khi sửa.
- **Tổng quan của GV:** buổi hôm nay và buổi quá hạn chưa điểm danh.

Chưa có ở giai đoạn này: xuất TKB ra PDF/Excel và trang Cấu hình để sửa số ngày khóa (đều thuộc Giai đoạn 4; hiện đổi số ngày khóa trực tiếp trong bảng `app_settings`).

## Đã có ở Giai đoạn 3

- **Tiêu chí sao:** Admin quản lý (số dương = thưởng, số âm = trừ). Khi ghi, số sao lấy từ tiêu chí ở máy chủ; client không tự gửi số sao.
- **Ghi sao theo buổi:** cho từng em, một nhóm hoặc cả lớp trong một thao tác; chỉ học viên thuộc buổi đó.
- **Sổ cái chỉ thêm:** `star_logs` không sửa, không xóa (có trigger ở CSDL). Hoàn tác tạo bản ghi đảo dấu, mỗi lần ghi chỉ hoàn tác được một lần.
- **Tổng sao:** tính khi truy vấn bằng `GREATEST(0, SUM(stars))`, không lưu cứng, không bao giờ âm.
- **Cấp bậc:** suy ra trực tiếp từ tổng sao toàn thời gian; trừ sao là tụt cấp ngay. Admin sửa được tên, mốc sao, màu khung (bảng cấp phải tăng dần).
- **Giới hạn trừ sao:** mỗi học viên bị trừ tối đa 3 sao/buổi (`max_deduction_per_session` trong `app_settings`); các lần đã hoàn tác không tính.
- **Avatar:** 15 robot SVG (12 mở theo cấp, 3 tặng riêng). GV của lớp và Admin đổi avatar cho học viên; chỉ chọn được avatar đã mở theo cấp hoặc được tặng. Avatar khóa hiển thị mờ kèm "Cần X sao".
- **Tự đổi avatar khi tụt cấp:** nếu avatar đang dùng bị khóa, hệ thống đổi sang avatar theo cấp cao nhất còn mở và báo cho GV. Avatar tặng riêng không mất khi tụt cấp. Lên cấp hiện thông báo chúc mừng (không tự đổi avatar).
- **Danh sách học viên của lớp:** avatar có khung viền theo cấp, tổng sao và thanh tiến độ "còn X sao để lên cấp".

Thiết kế lại bộ avatar: sửa `scripts/generate-avatars.mjs` rồi chạy `node scripts/generate-avatars.mjs`. Kho avatar là bộ có sẵn; hệ thống không cho tải SVG mới lên.

## Bảo mật- **Phân quyền ở máy chủ:** GV chỉ truy cập lớp được phân công; truy cập lớp khác trả 404 (không lộ sự tồn tại). Có test ở tầng service và test gọi trực tiếp qua HTTP.
- **Phiên:** cookie `httpOnly`, `SameSite=Lax`, `Secure` ở production; phiên được đọc lại từ CSDL mỗi request nên khóa tài khoản có hiệu lực ngay.
- **CSRF:** Better Auth và Server Action kiểm tra Origin; Route Handler ghi dữ liệu tự kiểm tra Origin.
- **Header:** CSP với nonce theo từng request (`script-src` không có `unsafe-inline`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **HTTPS:** bản production tự chuyển hướng HTTP → HTTPS. Triển khai sau reverse proxy có TLS và truyền `X-Forwarded-Proto`. Chỉ đặt `FORCE_HTTPS=false` khi thử `npm run build && npm start` trên máy.
- **Dữ liệu vào:** mọi input qua Zod; chỉ truy vấn tham số hóa qua Drizzle; nội dung do người dùng nhập luôn hiển thị dạng văn bản; tệp Excel được kiểm tra đuôi, chữ ký tệp, dung lượng (2 MB) và số dòng (500).
- **Dữ liệu trẻ em:** GV không nhận số điện thoại, tên phụ huynh, ghi chú của học viên. Log ứng dụng không ghi dữ liệu cá nhân.

### Rủi ro còn lại (đã biết)

- `style-src` cho phép `'unsafe-inline'` vì thư viện giao diện chèn style nội tuyến để định vị hộp thoại. Script vẫn bị khóa chặt bằng nonce.
- Giới hạn tốc độ của Server Action/API lưu trong bộ nhớ tiến trình: chỉ đúng khi chạy một instance. Giới hạn của đăng nhập lưu trong CSDL.
- Giới hạn tốc độ đăng nhập theo IP phụ thuộc header `X-Forwarded-For` do reverse proxy đặt; cần cấu hình proxy không cho client tự gửi header này.
- `npm audit` (05/10/2026): 15 cảnh báo, **không có cái nào nằm trên đường chạy production**:
  - `exceljs → uuid` (trung bình): lỗi chỉ ở `uuid` v3/v5/v6 khi truyền bộ đệm; ExcelJS không dùng cách gọi đó.
  - `drizzle-kit → esbuild`, `shadcn`/`eslint-config-next → fast-glob → braces` (trung bình/cao): chỉ là công cụ lúc phát triển, không có trong bản chạy thật. Sửa bằng `npm audit fix --force` sẽ hạ cấp gây lỗi nên chưa áp dụng; cập nhật khi upstream phát hành bản vá.
- Chưa có script sao lưu/khôi phục CSDL (thuộc Giai đoạn 4).
