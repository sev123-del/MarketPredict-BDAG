const path = require("path");

module.exports = {
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      path: require.resolve("path-browserify"),
      porto: false,
      "@react-native-async-storage/async-storage": false, // prevent SDK error
    };
    return config;
  },
  turbopack: {},
};
