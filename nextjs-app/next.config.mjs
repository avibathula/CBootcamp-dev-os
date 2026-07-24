/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse bundles pdfjs-dist, whose legacy build does environment
  // detection that breaks when webpack wraps it for the RSC/route-handler
  // bundle. Excluding it forces Next to `require` it natively at runtime.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  // react-pdf's pdfjs-dist probes for an optional native `canvas` module at
  // module-load time (Node-only, used for server-side rendering to a raster
  // image — not needed here since PdfViewer is browser-only). Webpack's dev
  // compiler tries to resolve/wrap it anyway, which corrupts pdfjs-dist's
  // ESM interop shim and throws "Object.defineProperty called on non-object"
  // the moment the client bundle loads. Production builds don't trigger it,
  // but `npm run dev` does — alias it away entirely.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
