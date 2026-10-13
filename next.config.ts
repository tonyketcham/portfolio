import { withNextVideo } from 'next-video/process';
import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [{ source: '/cms/:path*', destination: `http://127.0.0.1:${process.env.CMS_PORT ?? 4318}/cms/:path*` }];
  },
  /* config options here */
  webpack: (config, { isServer, dev }) => {
    const copyTransformVersion = createHash('sha256').update(
      ['loader.cjs', 'instrument.mjs', 'catalog.mjs'].map((file) => fs.readFileSync(path.resolve(__dirname, 'scripts/cms', file), 'utf8')).join('\n')
    ).digest('hex');
    config.module.rules.unshift({
      test: /\.[jt]sx?$/,
      include: [path.resolve(__dirname, 'app'), path.resolve(__dirname, 'content')],
      enforce: 'pre',
      use: [{ loader: path.resolve(__dirname, 'scripts/cms/loader.cjs'), options: { development: dev, version: copyTransformVersion } }],
    });
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
