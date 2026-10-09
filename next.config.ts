import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pdfmake đọc tệp font theo đường dẫn trong node_modules nên không được đóng gói vào bundle.
  // nodemailer dùng thẳng các module mạng của Node.js.
  serverExternalPackages: ["pdfmake", "nodemailer"],
  // Trên serverless (Netlify) chỉ các tệp được "trace" mới có mặt lúc chạy: kèm font cho các route xuất PDF.
  outputFileTracingIncludes: {
    "/api/export/**/*": ["./node_modules/pdfmake/fonts/Roboto/*.ttf"],
  },
};

export default nextConfig;
