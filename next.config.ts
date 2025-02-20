import { withNextVideo } from 'next-video/process';
import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (isServer) {
      const buildManifestPath = path.resolve(
        __dirname,
        '.next',
        'build-manifest.json'
      );
      if (!fs.existsSync(buildManifestPath)) {
        fs.writeFileSync(buildManifestPath, JSON.stringify({}));
      }
    }
    return config;
  },
};

export default withNextVideo(nextConfig);
