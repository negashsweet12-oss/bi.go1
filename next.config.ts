import path from 'path';
import type {NextConfig} from 'next';
import {PHASE_DEVELOPMENT_SERVER} from 'next/constants';

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    distDir: isDev ? '.next-dev' : '.next',
    output: 'standalone',
    outputFileTracingRoot: path.resolve(__dirname),
    outputFileTracingExcludes: {
      '*': ['.next-dev/**/*'],
    },
    reactStrictMode: true,
    devIndicators: false,
    productionBrowserSourceMaps: false,
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: false,
    },
    experimental: {
      webpackMemoryOptimizations: true,
      cpus: 1,
      workerThreads: false,
      optimizePackageImports: ['lucide-react', 'recharts', 'motion'],
    },
    // Allow access to remote image placeholder.
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**', // This allows any path under the hostname
        },
      ],
    },
    transpilePackages: ['motion'],
    webpack: (config, {dev, isServer}) => {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      if (dev && process.env.DISABLE_HMR === 'true') {
        config.watchOptions = {
          ignored: /.*/,
        };
      }
      if (!isServer && config.output) {
        config.output.chunkLoadTimeout = 300000;
      }
      return config;
    },
  };
}
