// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite's web implementation runs on a Web Worker backed by a wasm
// build of SQLite (wa-sqlite). Metro doesn't resolve .wasm imports as
// bundleable assets by default, so without this the worker bundle fails to
// build ("Unable to resolve './wa-sqlite/wa-sqlite.wasm'") and any
// openDatabaseAsync() call on web hangs forever waiting for a worker that
// never starts. See https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/.
config.resolver.assetExts.push('wasm');

// Add COOP/COEP headers so SharedArrayBuffer (used by wa-sqlite) is
// available in the browser during local development.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
