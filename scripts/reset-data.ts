import "dotenv/config";
import postgres from "postgres";

// Xóa toàn bộ dữ liệu nghiệp vụ để bắt đầu nhập dữ liệu thật. KHÔNG hoàn tác được — hãy sao lưu trước (scripts/backup.*).
// Chạy thử (chỉ đếm, không xóa):  npm run db:reset
// Xóa thật:                        npm run db:reset -- --confirm
//
// GIỮ LẠI: tài khoản Quản trị (mật khẩu, 2FA, phiên đăng nhập), cấp bậc, kho avatar, tiêu chí sao, cấu hình và bảng phân quyền.
// XÓA: mọi tài khoản không phải Quản trị và toàn bộ các bảng bên dưới.
const WIPED_TABLES = [
  "gift_redemptions",
  "gift_handovers",
  "course_summaries",
  "reward_tiers",
  "gifts",
  "student_avatar_gifts",
  "star_logs",
  "attendances",
  "session_students",
  "sessions",
  "schedule_templates",
  "enrollments",
  "class_teachers",
  "holidays",
  "classes",
  "time_slots",
  "rooms",
  "courses",
  "students",
  "teachers",
  "audit_logs",
  "rate_limit",
  "verification",
];

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("Thiếu biến môi trường DATABASE_URL (hoặc POSTGRES_URL).");
  const confirmed = process.argv.includes("--confirm");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const target = new URL(url);
    console.log(`CSDL: ${target.hostname}${target.pathname}`);

    const [{ admins, others }] = await sql<{ admins: number; others: number }[]>`
      select count(*) filter (where role = 'admin')::int as admins, count(*) filter (where role <> 'admin')::int as others from "user"`;
    if (admins === 0) throw new Error("CSDL chưa có tài khoản Quản trị — không xóa để tránh mất quyền truy cập. Hãy chạy npm run db:seed.");

    console.log(`Giữ ${admins} tài khoản Quản trị. Sẽ xóa ${others} tài khoản khác và dữ liệu các bảng:`);
    for (const table of WIPED_TABLES) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`;
      if (n > 0) console.log(`  ${table}: ${n} dòng`);
    }

    if (!confirmed) {
      console.log("Chưa xóa gì. Chạy lại với --confirm để xóa thật: npm run db:reset -- --confirm");
      return;
    }

    await sql.begin(async (tx) => {
      // Xóa tài khoản kéo theo phiên, mật khẩu và 2FA của tài khoản đó (ON DELETE CASCADE).
      await tx`delete from "user" where role <> 'admin'`;
      await tx`update "user" set teacher_id = null where teacher_id is not null`;
      // TRUNCATE không kèm CASCADE: nếu còn bảng khác tham chiếu tới thì báo lỗi thay vì xóa lan sang bảng ngoài danh sách.
      // Riêng teachers bị bảng user tham chiếu (bảng user được giữ) nên phải xóa bằng DELETE.
      await tx.unsafe(`truncate table ${WIPED_TABLES.filter((t) => t !== "teachers").map((t) => `"${t}"`).join(", ")}`);
      await tx`delete from teachers`;
      await tx`insert into audit_logs (action, table_name) values ('data_reset', 'all')`;
    });
    console.log("Đã xóa dữ liệu. Tài khoản Quản trị, cấp bậc, kho avatar, tiêu chí sao và cấu hình được giữ nguyên.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
