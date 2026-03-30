import {esbuildPlugin} from '@web/dev-server-esbuild';

export default {
  nodeResolve: true,
  rootDir: '../', // The root directory for the tests is the project root, not www/
  files: 'src/**/*.test.ts',
  plugins: [esbuildPlugin({ts: true, target: 'auto'})],
};
