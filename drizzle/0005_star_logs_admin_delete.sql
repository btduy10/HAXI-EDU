-- Sổ cái sao vẫn chỉ thêm. Ngoại lệ duy nhất: Admin xóa hẳn một dòng ghi danh nhập sai thì ứng dụng bật cờ
-- haxi.star_logs_admin_delete trong đúng giao dịch đó để xóa kèm lịch sử sao. UPDATE luôn bị chặn.
CREATE OR REPLACE FUNCTION star_logs_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('haxi.star_logs_admin_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'star_logs là sổ cái chỉ thêm, không được sửa hoặc xóa';
END;
$$ LANGUAGE plpgsql;
