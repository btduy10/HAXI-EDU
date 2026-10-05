-- Sổ cái sao chỉ được thêm: chặn UPDATE/DELETE ở mức CSDL.
CREATE OR REPLACE FUNCTION star_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'star_logs là sổ cái chỉ thêm, không được sửa hoặc xóa';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER star_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON star_logs
  FOR EACH ROW EXECUTE FUNCTION star_logs_append_only();
