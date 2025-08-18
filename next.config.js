/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      // Start conservative; add CSP later once you audit inline scripts/styles
    ];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
