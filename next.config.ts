import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake đọc tệp font theo đường dẫn trong node_modules nên không được đóng gói vào bundle.
  serverExternalPackages: ["pdfmake"],
};

export default nextConfig;
