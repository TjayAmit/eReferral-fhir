/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/usecase0", destination: "/valuesets", permanent: true },
      { source: "/usecase0/doh-valuesets", destination: "/valuesets/doh", permanent: true },
      { source: "/usecase0/hl7-valuesets", destination: "/valuesets/hl7", permanent: true },
    ];
  },
};

export default nextConfig;
