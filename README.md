# HAXI Robotics — Hệ thống quản lý Trung tâm Robotics

Ứng dụng web cho trung tâm dạy Robotics: quản lý giáo viên, học viên, lớp, thời khóa biểu, điểm danh, chấm sao, avatar game hóa và tổng kết tặng quà cuối khóa. Hai loại tài khoản: **Quản trị (Admin)** và **Giáo viên (GV)**. Học viên và phụ huynh không có tài khoản.

Cả 4 giai đoạn đã hoàn thành: nền tảng, TKB & điểm danh, sao & avatar, cuối khóa & báo cáo.

## Công nghệ

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS + shadcn/ui · PostgreSQL 17 + Drizzle ORM · Better Auth (tên đăng nhập + TOTP) · Zod · ExcelJS · pdfmake · Vitest · Playwright.

## Chạy trên máy

Yêu cầu: Node.js 22+ và Docker Desktop.

```bash
cp .env.example .env          # rồi đặt BETTER_AUTH_SECRET (lệnh tạo có ghi trong tệp)
docker compose up -d          # PostgreSQL ở cổng 5432, kèm CSDL test haxi_edu_test
npm install
npm run db:migrate            # tạo bảng
npm run db:seed               # tài khoản admin + cấu hình nền (chỉ chạy khi CSDL chưa có tài khoản)
npm run dev                   # http://localhost:3000
```

### Tài khoản ban đầu

| Tên đăng nhập | Vai trò | Ghi chú |
|---|---|---|
| `admin` | Quản trị | Sau khi đổi mật khẩu phải thiết lập xác thực hai lớp (TOTP) |

Seed chỉ tạo sẵn tài khoản `admin`. Tài khoản giáo viên do Admin tạo và chỉnh sửa trên giao diện, ở trang **Tài khoản** (thêm, sửa, đặt lại mật khẩu, khóa/mở khóa), gắn với giáo viên bạn đã thêm ở menu Giáo viên.

Mật khẩu tạm là giá trị `SEED_DEFAULT_PASSWORD` trong `.env` (mặc định `Haxi@2026`). Lần đăng nhập đầu **bắt buộc đổi mật khẩu** (tối thiểu 8 ký tự, có chữ và số).

Seed mặc định **không tạo dữ liệu mẫu**: chỉ có tài khoản `admin` và cấu hình nền (5 cấp bậc, tiêu chí sao, 15 avatar, cấu hình mặc định), để Admin nhập dữ liệu thật và dùng ngay. Với CSDL đã có tài khoản, chạy lại `npm run db:seed` chỉ bổ sung kho avatar còn thiếu.

Muốn có dữ liệu mẫu để thử trên máy (2 giáo viên và tài khoản `gv.lan`, `gv.minh`, 2 lớp đã sinh buổi học, 15 học viên, phòng, ca học, quà và mốc quà), đặt `SEED_DEMO_DATA=true` khi chạy seed trên CSDL trống. Kiểm thử tự động (Playwright) tự đặt biến này.

### Xóa dữ liệu để bắt đầu lại

```powershell
npm run db:reset                # chỉ đếm số dòng sẽ xóa, chưa xóa gì
npm run db:reset -- --confirm   # xóa thật, KHÔNG hoàn tác được — hãy sao lưu trước
```

Lệnh xóa toàn bộ giáo viên, học viên, khóa học, lớp, phòng, ca học, ngày nghỉ, ghi danh, buổi học, điểm danh, sao, quà, tổng kết, nhật ký và mọi tài khoản không phải Quản trị. Giữ lại: tài khoản Quản trị (mật khẩu, 2FA), cấp bậc, kho avatar, tiêu chí sao, cấu hình và bảng phân quyền. Lệnh chạy trên CSDL trong `DATABASE_URL`; để dọn CSDL đang triển khai, đặt `$env:DATABASE_URL = "<chuỗi kết nối>"` trước khi chạy.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Sinh kiểu route của Next rồi chạy `tsc` |
| `npm test` | Vitest: test đơn vị + test tích hợp trên CSDL `haxi_edu_test` (tự dựng lại schema) |
| `npm run test:e2e` | Playwright ở màn hình 360px, tự chạy server riêng (cổng 3100) trên CSDL test. Lần đầu cần `npx playwright install chromium` |
| `npm run db:generate` | Sinh migration sau khi sửa `src/db/schema` |
| `npm run db:migrate` / `db:seed` | Áp dụng migration / tạo tài khoản admin và cấu hình nền |
| `npm run db:reset` | Xóa dữ liệu nghiệp vụ, giữ tài khoản Quản trị và cấu hình (cần `-- --confirm`) |
| `.\scripts\backup.ps1` / `./scripts/backup.sh` | Sao lưu CSDL vào `backups/` (xem [scripts/restore.md](scripts/restore.md) để khôi phục) |

## Cấu trúc

```
src/
  proxy.ts              CSP theo nonce, header bảo mật, ép HTTPS, chặn sớm khi chưa đăng nhập
  app/(auth)            Đăng nhập, xác thực hai lớp, đổi mật khẩu
  app/(admin)/admin     Trang quản trị
  app/(teacher)/teacher Trang giáo viên
  app/api               Better Auth, nhập Excel, xuất Excel/PDF
  db/schema             Schema Drizzle (migration ở ./drizzle)
  domain                Quy tắc nghiệp vụ thuần, không phụ thuộc CSDL (lịch, sao, cấp, avatar, tổng kết)
  server/services       Nghiệp vụ + PHÂN QUYỀN (nơi duy nhất quyết định ai được làm gì)
  server/actions        Server Action: chỉ là vỏ (phiên → Zod → service)
  lib/validation        Schema Zod
public/avatars          15 avatar robot SVG (sinh bằng scripts/generate-avatars.mjs)
scripts                 migrate, seed, sao lưu, hướng dẫn khôi phục
tests/unit · tests/integration · tests/e2e
```

Nguyên tắc: mọi hàm trong `server/services` nhận `actor` lấy từ phiên ở máy chủ và tự kiểm tra quyền. Giao diện chỉ ẩn/hiện cho tiện, không phải lớp bảo vệ.

## Chức năng

### Tài khoản và phân quyền

- Đăng nhập bằng tên đăng nhập, băm Argon2id, buộc đổi mật khẩu lần đầu, khóa tạm sau 5 lần sai (15 phút), giới hạn tốc độ.
- 2FA (TOTP) bắt buộc với Admin, có mã dự phòng. Chỉ khi chạy thử mới tắt bằng biến môi trường `ADMIN_2FA_REQUIRED=false`.
- Vai trò: **Quản trị** (toàn quyền), hai vai trò có sẵn **Giáo viên**, **Giáo viên trực**, và các vai trò Admin tự tạo (vd. Lễ tân) ở **Cấu hình → Phân quyền**. Vai trò gán cho từng tài khoản ở **Admin → Tài khoản** (cột Vai trò), kể cả tài khoản gắn với giáo viên; menu Giáo viên không có cột Vai trò. Vai trò đang gán cho tài khoản thì không xóa được; vai trò đã xóa hoặc lạ không có quyền gì. Quyền của mỗi vai trò do Admin tick:
  - **Phạm vi lớp**: "Chỉ lớp của mình" (lớp được phân công; GV dạy thay có quyền trên đúng buổi mình dạy thay) hoặc "Tất cả lớp".
  - **Xem / Thêm / Sửa** theo từng menu. Tick Xem thì menu hiện trên thanh menu của vai trò đó và mở cùng trang Admin dùng, giới hạn trong phạm vi lớp.
  - Mặc định: Giáo viên điểm danh và chấm sao lớp mình; Giáo viên trực thấy mọi lớp và hỗ trợ điểm danh.
  - Luôn chỉ Admin: xóa dữ liệu; Tài khoản, Nhật ký, Cấu hình; nhập Excel; mở khóa điểm danh; tiêu chí sao, cấp bậc, kho avatar, tặng avatar.
  - Ngoài Admin, không ai thấy hay ghi được ngày sinh, giới tính, phụ huynh, điện thoại, ghi chú của học viên.
- Thứ tự menu quản trị: Tổng quan, **Giám đốc** (Khóa học, Phòng & Ca học, Giáo viên, Syllabus), **Admin** (Tài khoản, Cấu hình, Nhật ký), Học viên, Ghi danh, Lớp học, Thời khóa biểu, Điểm danh, **Sao & Quà** (Sao & Avatar, Quà & Tổng kết), Chấm công, Học phí, Báo cáo. Nhóm bấm để mở/đóng, tự mở khi đang ở trang thuộc nhóm; nhóm chỉ hiện khi vai trò được xem ít nhất một mục trong nhóm.
- Quyền được kiểm tra ở máy chủ trong từng service (`can`/`assertCan` trong `src/server/guard.ts`); ẩn menu và nút chỉ là phần hiển thị.

### Danh mục (Admin)

- Học viên (tìm kiếm, nhập Excel có xem trước và báo lỗi từng dòng), Giáo viên, Khóa học, Lớp học (phân công GV), Phòng, Ca học, Ngày nghỉ. Các bảng để mã trước tên (Mã HV – Họ tên, Mã GV – Họ tên); danh sách lớp xếp tăng dần theo ngày bắt đầu.
- **Tên viết tắt của giáo viên** (menu Giáo viên, không bắt buộc, tối đa 20 ký tự): Thời khóa biểu hiện tên viết tắt thay họ tên cho gọn (GV chính, dạy thay, trợ giảng, lớp học thêm); để trống thì dùng họ tên. Tệp xuất Thời khóa biểu vẫn ghi họ tên đầy đủ.
- Ca học: ca là một trong ba lựa chọn cố định **Sáng / Chiều / Tối** (chọn, không nhập tên); mỗi ca có nhiều khung giờ. Khi thêm/sửa, chọn Ca và **Khung giờ** (Khung 1 … Khung 10) rồi nhập giờ; cùng một ca không có hai khung cùng số. Bảng Ca học gộp ô Ca, sắp các khung theo số khung. Khi nâng cấp, ca có tên khác được quy về Sáng (bắt đầu trước 12:00), Chiều (trước 17:00) hoặc Tối, và đánh lại số khung theo giờ kết thúc.
- **Syllabus** (nhóm Giám đốc; quyền Xem / Thêm / Sửa theo Cấu hình → Phân quyền, xóa và nhập Excel chỉ Admin): danh sách bài học của từng lớp, cột Mã môn, Lớp, Tiết, Tên bài; một lớp không có hai bài cùng Mã môn + Tiết; trong mỗi lớp, bài xếp theo Tiết từ nhỏ tới lớn. Nhập Excel (.xlsx, tối đa 2 MB, 500 dòng) có tải tệp mẫu, xem trước và báo lỗi từng dòng; cột Lớp ghi mã lớp ở menu Lớp học; bài đã có cùng Lớp + Mã môn + Tiết thì cập nhật tên bài, chưa có thì thêm.
- **Điểm danh có tên bài và nhận xét:** ô Nội dung buổi học là ô chọn tên bài từ Syllabus của lớp ("Tiết 3 – Tên bài"), có lựa chọn "Khác (tự nhập)"; lớp chưa có syllabus thì vẫn là ô gõ. Bên dưới có khung Nhận xét của giáo viên sau buổi dạy. Cả hai được lưu khi bấm Lưu điểm danh; Admin xem ở chi tiết buổi học. Giáo viên của buổi chọn được bài của lớp mình mà không cần quyền menu Syllabus.
- **Học phí** (menu sau Chấm công; quyền Xem / Thêm / Sửa theo Cấu hình → Phân quyền, mặc định chỉ Admin):
  - Mức học phí đặt theo **lớp** (chọn lớp ở trang Học phí → Đặt học phí); mỗi học viên có thể được **giảm** riêng (số tiền + lý do). Phải đóng = học phí lớp − giảm. Lớp chưa đặt học phí được gợi ý sẵn 2,000,000 đồng/khóa; các ô nhập tiền tự thêm dấu phẩy phân cách hàng nghìn khi gõ.
  - **Thu tiền** nhiều lần được: mỗi lần là một **phiếu thu** (số `PT-000001` tăng dần; Tiền mặt / Chuyển khoản; ngày thu; người nộp). Không thu vượt số còn phải đóng. Trạng thái: Chưa đặt học phí / Chưa đóng / Đóng một phần / Đã đóng đủ; lọc theo lớp, trạng thái, mã hoặc tên học viên; có tổng Phải thu, Đã thu, Còn phải thu.
  - **In**: phiếu thu (số tiền bằng số và bằng chữ, chữ ký; dòng Tình hình học phí ghi "Đã đóng đủ tiền" hoặc "Đã đóng …, còn …") và **giấy báo học phí** từng học viên hoặc cả lớp (mỗi em một trang; có lựa chọn chỉ in em chưa đóng đủ). Mở trang rồi bấm In; đầu giấy lấy từ **Cấu hình → Thông tin trung tâm** (tên, địa chỉ, điện thoại, thông tin chuyển khoản).
  - Hủy phiếu thu chỉ Admin và phải nhập lý do; phiếu hủy được giữ lại nhưng không còn tính là đã đóng. Admin có thể xóa hẳn phiếu đã hủy (phiếu còn hiệu lực phải hủy trước; nội dung phiếu bị xóa vẫn nằm trong nhật ký, số phiếu không cấp lại). Lượt ghi danh đã có phiếu thu thì không xóa được. Mọi thao tác thu, hủy, đổi học phí, đổi mức giảm đều ghi nhật ký.
  - Giấy in chỉ có tên và mã học viên, không lấy ngày sinh, điện thoại, phụ huynh từ hồ sơ; "Người nộp" là ô nhập tay khi thu.
- **Lớp học thêm** (bảng dưới lưới của trang Thời khóa biểu; thêm/sửa theo quyền Thêm/Sửa của menu Thời khóa biểu, xóa chỉ Admin): lớp ngoài hệ thống, chỉ để giữ phòng. Nhập Lớp, chọn Khóa học, Phòng, Thứ, Ca – Khung giờ, Giáo viên (có thể trống); lặp hằng tuần cho đến khi xóa. Thời khóa biểu hiện các lớp này với nhãn "Học thêm" (không bấm vào được, không điểm danh, sao, chấm công; không theo bảng Ngày nghỉ). Tệp xuất Thời khóa biểu chỉ gồm buổi học của các lớp Robotics, không gồm lớp học thêm. Báo trùng chỉ khi trùng cả Thứ + Ca + Khung giờ mà cùng phòng hoặc cùng giáo viên, với lớp học thêm khác hoặc với lịch mẫu của lớp chưa đóng (cả hai chiều).
- Ghi danh: chặn vượt sĩ số, giữ lịch sử rời lớp.
- Tài khoản: tạo, đặt lại mật khẩu, khóa/mở, đặt lại 2FA.

### Thời khóa biểu và điểm danh

- **Phân công giáo viên:** mỗi GV của lớp có vai trò GV chính hoặc Trợ giảng (sửa được). Lương không đặt ở Lớp học mà ở Chấm công → Mức lương giáo viên/Nhân viên.
- **Lịch mẫu & sinh buổi:** mỗi lớp nhiều dòng lịch mỗi tuần: thứ, ca, phòng, GV chính, trợ giảng (nếu có). Số buổi của lớp không vượt số buổi của Khóa học (buổi hủy và buổi bù không tính). Thêm dòng lịch mẫu (hoặc đổi thứ) là các buổi sắp tới tự xếp lại theo thứ tự ngày cho đủ số buổi, trong thời gian của lớp; sửa dòng lịch mẫu thì các buổi sắp tới chưa điểm danh tự đổi theo (chỉ những phần chưa sửa tay; đổi thứ thì sinh lại). Buổi bị trùng lịch được bỏ qua và báo lại. Nút "Sinh buổi học từ lịch mẫu" xếp lại toàn bộ buổi chưa dạy của lớp (kể cả buổi xếp tay, đã sửa riêng) đúng thứ, ca, phòng, GV của lịch mẫu, từ ngày bắt đầu của lớp (buổi 1 luôn vào đúng ngày khai giảng, dùng ca/phòng/GV của dòng lịch mẫu có buổi sớm nhất), cho đủ số buổi khóa học (thiếu thì xếp tiếp các tuần sau và tự lùi ngày kết thúc của lớp tới buổi cuối); buổi đã điểm danh/ghi sao và buổi đã hủy giữ nguyên.
- **Giờ riêng từng buổi:** giờ được sao chép từ ca lúc sinh; sửa một buổi không đổi ca gốc hay buổi khác, sửa ca không đổi buổi đã sinh.
- **Trùng lịch:** hai buổi cùng ngày chỉ trùng khi **cùng Ca + Khung giờ** (cùng một dòng Ca học) mà có chung GV thực dạy (đã tính dạy thay), trợ giảng, hoặc cùng phòng. Khác khung giờ thì không trùng, kể cả khi giờ hai khung chồng nhau — giáo viên dạy nhiều ca, nhiều khung trong ngày là bình thường. Buổi bù giờ tự do (không gắn ca) so theo khoảng giờ thực tế. Trùng thì **chặn** (khi sinh buổi: bỏ qua và báo lại); vượt sức chứa phòng thì **cảnh báo** nhưng vẫn lưu. Một lớp không có hai dòng lịch mẫu cùng Thứ + Ca + Khung giờ (thêm/sửa bị chặn); dòng lặp có sẵn trong dữ liệu cũ được bỏ qua khi sinh buổi, không báo trùng với chính lớp đó.
- **Điều chỉnh:** sửa riêng một buổi (giờ, phòng, GV chính, trợ giảng), dời buổi (giữ ngày gốc), hủy/khôi phục, GV dạy thay (lưu cả GV gốc và GV thay), buổi bù chỉ gồm học viên được chọn. Admin xóa hẳn được buổi xếp sai, kể cả buổi đã điểm danh/ghi sao: điểm danh và sao của buổi bị xóa theo, cấp và avatar được tính lại; lớp đã đóng thì không xóa.
- **Trợ giảng** thấy lớp ở "Lớp của tôi", có buổi trong TKB của mình và được điểm danh, ghi sao các buổi mình trợ giảng.
- **Chấm công** (quyền Xem / Thêm / Sửa theo Cấu hình → Phân quyền; phạm vi "lớp của mình" chỉ thấy và thao tác công của chính mình): mỗi buổi đã điểm danh là một công cho người thực dạy và một công trợ giảng cho trợ giảng. Trang và tệp Excel (tổng hợp, từng giáo viên) có cột Mức lương và Thành tiền. Bảng Tổng công (Số buổi, Dạy thay, Trợ giảng…) xếp theo mã giáo viên; bảng Chi tiết buổi dạy xếp tăng dần theo ngày rồi giờ dạy, cột Thứ ghi gọn (Hai … Bảy, Chủ nhật), cột Lớp là tên lớp.
  - **Mức lương giáo viên/Nhân viên** (nút trước Chấm công bổ sung): đặt mức lương mỗi buổi theo từng lớp cho giáo viên, trợ giảng (chọn Giáo viên, Lớp dạy, nhập Mức lương); mỗi giáo viên một mức ở mỗi lớp. Thành tiền = số công đã dạy × mức lương của đúng giáo viên ở đúng lớp; công ở lớp chưa đặt mức lương được báo riêng, không cộng tiền. Đặt mức lương cần quyền Sửa và phạm vi "Tất cả lớp" (người chỉ thấy công của mình không tự đặt lương, chỉ thấy tiền của chính mình); xóa mức lương chỉ Admin.
  - **Chấm công bổ sung** (quyền Thêm): dòng công ghi tay gồm Giáo viên, Ngày, Ca – Khung giờ, Lớp, Vai trò, Ghi chú; chỉ nằm ở bảng Chấm công, không tạo buổi học. Xóa công bổ sung chỉ Admin.
  - **Sửa chấm công** (quyền Sửa): sửa Ngày, Ca – Khung giờ, Lớp của mọi dòng công. Với dòng sinh từ buổi học, phần sửa chỉ áp dụng trên bảng công (dòng có nhãn "Đã sửa"); Thời khóa biểu và điểm danh giữ nguyên; sửa về đúng giá trị của buổi thì bỏ nhãn.
  - Một giáo viên không có hai dòng công cùng Ngày + Ca + Khung giờ.
- **Thời khóa biểu:** lưới tuần thứ × ca và lịch tháng; Admin lọc theo GV/lớp/phòng; xuất Excel/PDF.
- **Màu theo giáo viên trên Thời khóa biểu:** mỗi giáo viên đang dạy một độ đậm của cùng tông xanh ngọc (xếp theo mã, người đầu nhạt nhất; `src/domain/timetable-colors.ts`), tô theo người thực dạy (giáo viên dạy thay nếu có). Lớp học thêm đậm nhất, chữ trắng. Buổi đã điểm danh có dấu tick xanh; buổi đã hủy không tô màu. Phía trên lưới có chú giải màu. Chỉ đổi độ đậm của một màu nên trên khoảng 6 giáo viên thì hai mức liền nhau khó phân biệt; tên giáo viên vẫn ghi trong ô.
- **Nền theo ca trên Thời khóa biểu:** các khung cùng ca cùng một độ sáng; Ca sáng giữ nền trang, Ca chiều đậm hơn một bậc, Ca tối đậm nhất (biến `--shift-1..3` trong `globals.css`, cùng tông kem, chỉ đổi độ sáng; bậc lấy từ `shiftTone` ở `src/domain/time-slots.ts`). Trên điện thoại, thẻ buổi học tô theo giáo viên (không theo ca). Ô và thẻ buổi học dùng kiểu Liquid (mặt kính bán trong suốt, viền sáng, bóng mềm; các utility `glass-*`), chỉ bằng CSS, không dùng blur và không tải thêm ảnh.
- **Điểm danh trên điện thoại:** danh sách chỉ gồm học viên đang ghi danh tại ngày học, mặc định "Có mặt", lưu cả lớp một lần.
- **Khóa sửa điểm danh** sau N ngày (mặc định 7, sửa ở trang Cấu hình). Chỉ Admin mở khóa, mỗi lần 24 giờ.

### Sao, cấp bậc và avatar

- **Ghi sao theo buổi** cho từng em, một nhóm hoặc cả lớp. Số sao lấy từ tiêu chí ở máy chủ.
- **Sổ cái chỉ thêm:** `star_logs` không sửa, không xóa (có trigger ở CSDL). Hoàn tác tạo bản ghi đảo dấu, mỗi lần ghi chỉ hoàn tác được một lần. Ngoại lệ chỉ dành cho Admin, đều có ghi Nhật ký và tính lại cấp, avatar: (1) xóa hẳn một dòng ghi danh nhập sai ở trang Ghi danh thì điểm danh và lịch sử sao của học viên ở lớp đó, trong thời gian ghi danh, bị xóa theo; (2) ở hồ sơ học viên, xóa hẳn từng lần ghi sao hoặc toàn bộ lịch sử sao (sao của lớp đã đóng được giữ).
- **Hai loại tổng sao**, đều tính khi truy vấn bằng `GREATEST(0, SUM(stars))` và không lưu cứng: tổng toàn thời gian (lên cấp, mở avatar) và tổng theo lớp (xếp hạng, tặng quà).
- **Cấp bậc** suy ra trực tiếp từ tổng toàn thời gian; trừ sao là tụt cấp ngay. Mỗi học viên bị trừ tối đa N sao/buổi (mặc định 3, sửa ở trang Cấu hình).
- **Avatar:** 15 robot SVG (12 mở theo cấp, 3 tặng riêng). GV của lớp và Admin đổi avatar cho học viên. Avatar khóa hiển thị mờ kèm "Cần X sao".
- **Tụt cấp** làm khóa avatar đang dùng thì hệ thống tự đổi sang avatar cao nhất còn mở và báo cho GV. Avatar tặng riêng không mất. Lên cấp hiện thông báo chúc mừng.
- Thiết kế lại bộ avatar: sửa `scripts/generate-avatars.mjs` rồi chạy `node scripts/generate-avatars.mjs`. Hệ thống không cho tải SVG mới lên.

### Cuối khóa và báo cáo

- **Đóng lớp & chốt tổng kết** (Admin): lưu ảnh chụp tổng sao khóa, tỷ lệ chuyên cần và xếp hạng vào `course_summaries`. Phải xử lý hết buổi đã qua chưa điểm danh trước; các buổi tương lai còn lại bị hủy. Sau khi đóng, lớp không điểm danh, ghi sao hay ghi danh thêm được nữa.
- **Chuyên cần** = (có mặt + đi trễ + về sớm) ÷ số buổi đã dạy mà học viên thuộc danh sách; không kể buổi hủy và buổi chưa dạy.
- **Xếp hạng** theo tổng sao của lớp, đồng hạng kiểu 1-2-2-4.
- **Mốc quà** theo khóa học hoặc riêng cho lớp (lớp có mốc riêng thì không dùng mốc của khóa). Mỗi học viên nhận quà của mốc cao nhất đạt được.
- **Đổi quà bằng sao trong khóa học:** ở hồ sơ học viên, người có quyền Sửa ở menu Quà & Tổng kết (theo Cấu hình → Phân quyền) đổi quà cho học viên bất cứ lúc nào em đủ sao theo Mốc quà của lớp đang học. Mỗi lần đổi trừ "sao còn lại" đúng bằng mốc sao và trừ 1 tồn kho; tổng sao tích lũy, cấp bậc và avatar không đổi. Chỉ Admin hủy được lần đổi ghi nhầm (trả lại sao và tồn kho).
- **Quy trình trao quà:** hệ thống đề xuất → Admin chọn và duyệt → ghi nhận đã trao (ngày, người trao, trừ tồn kho). Có bảng số lượng quà cần chuẩn bị so với tồn kho.
- **Báo cáo** (menu Báo cáo; quyền Xem / Thêm / Sửa theo Cấu hình → Phân quyền **và** phạm vi "Tất cả lớp", mặc định chỉ Admin) là báo cáo tài chính của cả trung tâm, gồm bốn mục:
  - **Doanh thu:** xem theo Tuần (12 tuần tới tuần chứa ngày mốc), Tháng (12 tháng của năm) hoặc Năm (5 năm gần nhất); ba ô tổng Doanh thu – Chi – Lãi; biểu đồ cột của chỉ số đang chọn (Doanh thu / Chi / Lãi, kỳ lỗ vẽ dưới trục 0) và bảng từng kỳ. Doanh thu = phiếu thu học phí còn hiệu lực theo ngày thu; Chi = chi lương + mua sắm; Lãi = Doanh thu − Chi.
  - **Chi lương:** lương tháng của từng giáo viên, tự tính từ Chấm công (số công đã dạy × mức lương ở từng lớp); công chưa có mức lương được báo riêng.
  - **Mua sắm:** nhập Ngày mua, Hạng mục mua, Loại (nhóm chi gõ tự do, có gợi ý các loại đã nhập), Số lượng, Đơn giá; Thành tiền = Số lượng × Đơn giá. Thêm/Sửa theo quyền, xóa chỉ Admin.
  - **Học phí chưa đóng:** học viên còn phải đóng (chưa đóng hoặc đóng một phần) ở các lớp đã đặt học phí, lọc theo lớp, xuất Excel/PDF. Tệp chỉ có mã, họ tên, lớp và số tiền — không có điện thoại, phụ huynh, ngày sinh.
  - Báo cáo lớp (điểm danh, sao theo học viên) đã bỏ ở cả menu Báo cáo lẫn khu giảng dạy; số liệu sao và chuyên cần của lớp vẫn xem ở Sao & Quà → Quà & Tổng kết.
- **Xuất Excel/PDF:** thời khóa biểu, tổng kết (kèm danh sách trao quà có cột ký nhận để in), chấm công, danh sách học phí chưa đóng. Mỗi lần xuất được ghi vào nhật ký.
- **Nhật ký** (Admin): lọc theo hành động, bảng, khoảng ngày; xem giá trị cũ/mới.
- **Cấu hình** (Admin): số ngày khóa điểm danh, giới hạn trừ sao mỗi buổi.

## Giao diện

Kiểu "cửa sổ kính" trên nền thiên nhiên mờ; mọi trang dùng chung một bộ token nên trông nhất quán.

- **Token màu, bo góc** nằm ở một chỗ: khối `:root` trong `src/app/globals.css` (xanh lá ngọc `#2E7D5B`, teal `#4DD0C0` cho mục/tab đang chọn, navy `#0E2841`, nền kem `#FDF8F2`, vàng đồng của logo). Font Be Vietnam Pro (400/500/600) nạp bằng `next/font` ở `src/app/layout.tsx`.
- **Nền:** xanh ngọc chuyển dọc (sáng ở trên, ngả xanh lam và đậm dần xuống dưới), cố định toàn trang. Màu nằm ở utility `app-bg` trong `globals.css`, hiển thị qua `src/components/app-background.tsx`; chỉ là CSS, không tải ảnh. Đổi màu nền thì tính lại tương phản chữ trên `glass-window`.
- **Ba cấp kính** (class trong `globals.css`): `glass-card` cho thẻ số liệu và biểu đồ; `glass-solid` (trắng 90%) cho bảng, form, dòng danh sách; `glass-sidebar` cho thanh điều hướng. Vùng nội dung là một `glass-window` đặt cạnh `<main>` trong `src/components/app-shell.tsx`.
- **Blur** (`backdrop-filter`) chỉ bật ở thanh điều hướng, cửa sổ nội dung và thẻ đăng nhập, từ 768px trở lên; điện thoại dùng nền gần đặc. Không bọc nội dung trang trong phần tử có `backdrop-filter` hay `transform`: thanh Lưu cố định ở Điểm danh/Chấm sao sẽ lệch.
- **Bố cục:** từ 1280px thanh điều hướng đầy đủ; 768–1279px thu thành dải icon; dưới 768px là menu trượt. Bề rộng thanh điều hướng nằm trong biến `--sidebar-w`.
- **Hiệu ứng** (CSS thuần, không thêm thư viện): thẻ Tổng quan hiện lần lượt (`stagger`), số KPI đếm tăng (`src/components/count-up.tsx`), biểu đồ vẽ dần (`chart-grow-*`, `chart-draw`), thẻ nổi khi rê chuột (`card-lift`), pill teal trượt giữa các mục menu, nội dung hiện dần khi chuyển trang. Tất cả tắt khi máy bật "giảm chuyển động".
- **Ảnh so sánh giao diện:** `SHOTS=<tên bộ ảnh> npm run test:e2e` chụp các trang chính ở 360/768/1280/1920px vào `ui-shots/<tên bộ ảnh>/` (không commit).

## Triển khai trên Vercel

Vercel không chạy Docker nên cần một PostgreSQL bên ngoài. Repo đã có `vercel.json`: mỗi lần build chạy `npm run db:migrate` rồi `npm run build`, hàm chạy ở vùng Singapore (`sin1`). Gói Hobby của Vercel chỉ dành cho mục đích phi thương mại.

1. **Vercel → Add New → Project** → nhập repo này. Không cần sửa lệnh build.
2. **Tạo CSDL:** trong dự án, vào **Storage → Create Database → Neon** (chọn vùng Singapore). Vercel tự thêm biến `DATABASE_URL` (đã là địa chỉ pooler). Nếu tự tạo CSDL ở nơi khác thì thêm `DATABASE_URL` bằng tay, dùng chuỗi kết nối pooler có `sslmode=require`.
3. **Settings → Environment Variables**, thêm:

   | Biến | Giá trị |
   |---|---|
   | `BETTER_AUTH_SECRET` | Chuỗi ngẫu nhiên 32 byte: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `DB_PREPARE` | `false` (pooler kiểu PgBouncer không hỗ trợ prepared statement) |
   | `DB_POOL_MAX` | `3` (mỗi hàm serverless có pool riêng) |

   Khi chỉ chạy thử, có thể thêm `ADMIN_2FA_REQUIRED` = `false` để Admin không bị bắt thiết lập xác thực hai lớp. Xóa biến này (rồi deploy lại) trước khi nhập dữ liệu thật của học viên.

   Không cần đặt `BETTER_AUTH_URL`: ứng dụng tự lấy địa chỉ production của dự án. Chỉ đặt khi muốn dùng một tên miền khác với tên miền production chính.
4. **Deploy** (hoặc Redeploy nếu lần đầu thiếu biến). Bảng được tạo tự động ở bước build.
5. **Tạo tài khoản đầu tiên** bằng cách chạy seed từ máy của bạn, trỏ vào CSDL đó (chuỗi kết nối xem ở Storage → `.env.local`). Đặt mật khẩu tạm riêng, đừng dùng mặc định trên trang công khai:

   ```powershell
   $env:DATABASE_URL = "<chuỗi kết nối>"; $env:SEED_DEFAULT_PASSWORD = "<mật khẩu tạm của bạn>"; npm run db:seed
   ```

   Seed tạo tài khoản `admin` và cấu hình nền, không có dữ liệu mẫu. Đăng nhập `admin` ngay sau đó để đổi mật khẩu và bật 2FA. Tài khoản GV và Admin khác tạo ở trang **Tài khoản**.

Khác biệt khi chạy trên Vercel:

- Giới hạn tốc độ của Server Action/API (lưu trong bộ nhớ tiến trình) không đáng tin vì các lần gọi có thể chạy ở những tiến trình khác nhau. Giới hạn đăng nhập và khóa tài khoản lưu trong CSDL nên vẫn đúng.
- `scripts/backup.*` không dùng được (dựa vào Docker); dùng tính năng sao lưu/khôi phục của nhà cung cấp CSDL.
- Chỉ đăng nhập được ở địa chỉ production. Địa chỉ xem trước (preview) có tên miền khác nên bị từ chối, và mỗi bản preview cũng chạy migration vào cùng CSDL.
- Cấu hình này **chưa được chạy thật trên Vercel**. Sau lần deploy đầu hãy thử: đăng nhập, thiết lập 2FA, điểm danh, và xuất một tệp PDF.

## Triển khai trên Netlify (phương án khác)

Netlify không chạy Docker nên cần một PostgreSQL bên ngoài (Neon, Supabase…). Repo đã có `netlify.toml`: mỗi lần build sẽ chạy `npm run db:migrate` rồi `npm run build`.

1. **Tạo CSDL** (ví dụ Neon, chọn vùng Singapore) và lấy chuỗi kết nối dạng **pooler** (`...-pooler...`, có `sslmode=require`).
2. **Netlify → Add new site → Import an existing project** → chọn repo này. Giữ nguyên lệnh build mà Netlify đọc từ `netlify.toml`.
3. **Site configuration → Environment variables**, thêm:

   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | Chuỗi kết nối pooler của CSDL |
   | `BETTER_AUTH_SECRET` | Chuỗi ngẫu nhiên 32 byte: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `DB_PREPARE` | `false` (pooler kiểu PgBouncer không hỗ trợ prepared statement) |
   | `DB_POOL_MAX` | `3` (mỗi hàm serverless có pool riêng) |
   | `CLIENT_IP_HEADER` | `x-nf-client-connection-ip` (IP thật của client để giới hạn tốc độ đăng nhập) |

   Không cần đặt `BETTER_AUTH_URL` nếu dùng địa chỉ chính của trang (ứng dụng tự lấy biến `URL` của Netlify). Nếu gắn tên miền riêng, đặt `BETTER_AUTH_URL` bằng địa chỉ đó.
4. **Deploy.** Bảng được tạo tự động ở bước build.
5. **Tạo tài khoản đầu tiên** bằng cách chạy seed từ máy của bạn, trỏ vào CSDL đó. Đặt mật khẩu tạm riêng, đừng dùng mặc định trên trang công khai:

   ```powershell
   $env:DATABASE_URL = "<chuỗi kết nối>"; $env:SEED_DEFAULT_PASSWORD = "<mật khẩu tạm của bạn>"; npm run db:seed
   ```

   Seed tạo tài khoản `admin` và cấu hình nền, không có dữ liệu mẫu. Đăng nhập `admin` ngay sau đó để đổi mật khẩu và bật 2FA.

Khác biệt khi chạy trên Netlify:

- Giới hạn tốc độ của Server Action/API (lưu trong bộ nhớ tiến trình) gần như không có tác dụng vì mỗi lần gọi có thể chạy ở một tiến trình khác. Giới hạn đăng nhập và khóa tài khoản lưu trong CSDL nên vẫn đúng.
- `scripts/backup.*` không dùng được (dựa vào Docker); dùng tính năng sao lưu của nhà cung cấp CSDL.
- Chỉ dùng địa chỉ chính của trang. Địa chỉ xem trước (deploy preview) có tên miền khác nên đăng nhập sẽ bị từ chối.
- Cấu hình này đã được kiểm tra bằng bản build cục bộ của Netlify tới bước đóng gói, **chưa được chạy thật trên Netlify**. Sau lần deploy đầu hãy thử: đăng nhập, thiết lập 2FA, điểm danh, và xuất một tệp PDF.

## Bảo mật

- **Phân quyền ở máy chủ:** GV truy cập lớp, buổi học, học viên hay báo cáo của lớp khác đều nhận 404 (không lộ sự tồn tại). Có test ở tầng service và test gọi trực tiếp qua HTTP.
- **Phiên:** cookie `httpOnly`, `SameSite=Lax`, `Secure` ở production; phiên được đọc lại từ CSDL mỗi request nên khóa tài khoản có hiệu lực ngay.
- **CSRF:** Better Auth và Server Action kiểm tra Origin; Route Handler ghi dữ liệu tự kiểm tra Origin.
- **Header:** CSP với nonce theo từng request (`script-src` không có `unsafe-inline`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **HTTPS:** bản production tự chuyển hướng HTTP → HTTPS. Triển khai sau reverse proxy có TLS và truyền `X-Forwarded-Proto`. Chỉ đặt `FORCE_HTTPS=false` khi thử `npm run build && npm start` trên máy.
- **Dữ liệu vào:** mọi input qua Zod; chỉ truy vấn tham số hóa qua Drizzle; nội dung do người dùng nhập luôn hiển thị dạng văn bản; tệp Excel được kiểm tra đuôi, chữ ký tệp, dung lượng (2 MB) và số dòng (500).
- **Nhật ký `audit_logs`:** đăng nhập, thay đổi tài khoản, điểm danh, sao, avatar, lịch học, đóng lớp, trao quà, cấu hình, xuất báo cáo và mọi thao tác tạo/sửa/xóa.
- **Dữ liệu trẻ em:** GV không nhận số điện thoại, tên phụ huynh, ghi chú của học viên. Log ứng dụng không ghi dữ liệu cá nhân. Tệp sao lưu và tệp xuất có dữ liệu cá nhân: lưu và chia sẻ cẩn thận.

### Rủi ro còn lại (đã biết)

- **Script sao lưu chưa được chạy thử.** `scripts/backup.*` và các lệnh trong `scripts/restore.md` được viết theo tài liệu của `pg_dump`/`pg_restore` và Docker Compose nhưng chưa chạy trên máy phát triển (máy không có Docker). Hãy chạy thử một vòng sao lưu → khôi phục sang CSDL phụ trước khi dựa vào nó.
- **`docker-compose.yml` cũng chưa được chạy thử** vì lý do trên; toàn bộ test chạy trên một PostgreSQL 18 cài tạm, không phải image `postgres:17-alpine`.
- `style-src` cho phép `'unsafe-inline'` vì thư viện giao diện chèn style nội tuyến để định vị hộp thoại. Script vẫn bị khóa chặt bằng nonce.
- Giới hạn tốc độ của Server Action/API lưu trong bộ nhớ tiến trình: chỉ đúng khi chạy một instance. Giới hạn của đăng nhập lưu trong CSDL.
- Giới hạn tốc độ đăng nhập theo IP phụ thuộc header `X-Forwarded-For` do reverse proxy đặt; cần cấu hình proxy không cho client tự gửi header này.
- Nhật ký lưu giá trị cũ/mới của bản ghi nên có chứa dữ liệu cá nhân của học viên; chỉ Admin xem được và chưa có cơ chế tự xóa nhật ký cũ.
- Chưa có chức năng mở lại lớp đã đóng. Nếu đóng nhầm phải sửa trực tiếp trong CSDL.
- `npm audit` (05/10/2026): 15 cảnh báo (6 trung bình, 9 cao), **không có cái nào nằm trên đường chạy production**:
  - `exceljs → uuid` (trung bình): lỗi chỉ ở `uuid` v3/v5/v6 khi truyền bộ đệm; ExcelJS không dùng cách gọi đó.
  - `drizzle-kit → esbuild`, `shadcn`/`eslint-config-next → fast-glob → braces` (trung bình/cao): chỉ là công cụ lúc phát triển, không có trong bản chạy thật. Sửa bằng `npm audit fix --force` sẽ hạ cấp gây lỗi nên chưa áp dụng; cập nhật khi upstream phát hành bản vá.
