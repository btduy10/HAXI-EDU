import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake đọc tệp font theo đường dẫn trong node_modules nên không được đóng gói vào bundle.
  serverExternalPackages: ["pdfmake"],
  // Trên serverless (Netlify) chỉ các tệp được "trace" mới có mặt lúc chạy: kèm font cho các route xuất PDF.
  outputFileTracingIncludes: {
    "/api/export/**/*": ["./node_modules/pdfmake/fonts/Roboto/*.ttf"],
  },
};

export default nextConfig;
