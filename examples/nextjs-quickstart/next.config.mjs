/** @type {import('next').NextConfig} */
const nextConfig = {
  // native addon (.node) ต้องโหลดตอนรันจริง ไม่ให้ bundler รวมเข้าไป
  serverExternalPackages: ["@thaireport/node"],
};

export default nextConfig;
