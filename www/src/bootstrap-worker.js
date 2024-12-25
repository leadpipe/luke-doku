/* eslint-disable no-undef */

const workerPromise = import('./worker/puzzle-worker.ts').catch(e =>
  console.error('Error importing `puzzle-worker.ts`:', e),
);

self.onmessage = async e => {
  const {handleToWorkerMessage} = await workerPromise;
  handleToWorkerMessage(self, e.data);
};
