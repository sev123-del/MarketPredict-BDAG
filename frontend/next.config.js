const path = require("path");

module.exports = {
  // Prevent generating browser source maps in production (reduces CSP eval traces)
  productionBrowserSourceMaps: false,
  webpack: (config, { dev, isServer }) => {
    // Prevent libraries from trying to use node fs/path in browser
    config.resolve.fallback = {
      fs: false,
      path: require.resolve("path-browserify"),
      porto: false,
      "@react-native-async-storage/async-storage": false, // prevent SDK error
    };

    // In dev the default devtool can use eval() (e.g. eval-source-map).
    // Disable devtool to avoid runtime eval usage which triggers strict CSP.
    if (dev && !isServer) {
      config.devtool = false;
    }

    return config;
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};
