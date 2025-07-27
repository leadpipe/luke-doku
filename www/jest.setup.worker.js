// Jest setup file to mock Worker globally for all tests
// @ts-ignore
if (typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = class {
    onerror = null;
    onmessage = null;
    onmessageerror = null;
    constructor() {}
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false;
    }
  };
}
