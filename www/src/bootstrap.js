// A dependency graph that contains any wasm must all be imported
// asynchronously. This `bootstrap.js` file does the single async import, so
// that no one else needs to worry about it again.
import('./index.ts').catch(e =>
  // eslint-disable-next-line no-undef
  console.error('Error importing `index.ts`:', e),
);
