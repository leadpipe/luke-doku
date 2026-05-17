declare module 'vite-plugin-eslint' {
  import { Plugin } from 'vite';
  const eslintPlugin: (options?: any) => Plugin;
  export default eslintPlugin;
}
