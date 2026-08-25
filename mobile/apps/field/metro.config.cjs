const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

// Expo's automatic monorepo root is correct for dev/export. Gradle's
// export:embed resolves its entry relative to the server root on Windows, so
// only that native task needs an app-local server root.
if (process.argv.includes('export:embed')) {
  config.server.unstable_serverRoot = projectRoot;
}
config.watchFolders = [...new Set([...config.watchFolders, workspaceRoot])];
config.resolver.nodeModulesPaths = [...new Set([
  ...config.resolver.nodeModulesPaths,
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
])];

// pnpm's hoisted node-linker materialises full copies of react/react-native
// under packages/*/node_modules. Metro would then bundle a second React and a
// second React Native, and the duplicate instance's internals come back null
// ("Cannot read property 'use' of null" on first render). Hide the nested
// copies so resolution walks up to the single workspace-root install.
const duplicatedSingletons =
  /[\\/]packages[\\/][^\\/]+[\\/]node_modules[\\/](react|react-dom|react-is|scheduler|react-native|react-native-safe-area-context)[\\/]/;
config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  duplicatedSingletons,
];

module.exports = config;
