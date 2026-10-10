-- Bảng phân quyền đã lưu (Cấu hình → Phân quyền) đè lên mặc định, nên cập nhật trực tiếp quyền của menu QL Học viên
-- cho hai vai trò có sẵn: Giáo viên được Xem; Giáo viên trực được Xem + Sửa và xem thông tin cá nhân học viên.
-- Chỉ đụng tới đúng các ô này; các ô khác Admin đã chỉnh giữ nguyên. Chưa lưu bảng phân quyền lần nào (không có dòng)
-- hoặc thiếu vai trò thì không làm gì, ứng dụng tự dùng mặc định mới.
UPDATE "app_settings"
SET "value" = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set("value", '{teacher,menus,students,view}', 'true'::jsonb),
          '{duty_teacher,menus,students,view}', 'true'::jsonb
        ),
        '{duty_teacher,menus,students,edit}', 'true'::jsonb
      ),
      '{duty_teacher,studentPrivate}', 'true'::jsonb
    ),
    "updated_at" = now()
WHERE "key" = 'role_permissions' AND jsonb_typeof("value") = 'object';
