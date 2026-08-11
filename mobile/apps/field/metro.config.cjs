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

module.exports = config;
