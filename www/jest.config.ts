import type {Config} from '@jest/types';

const config: Config.InitialOptions = {
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['jest-date-mock', './jest.setup.worker.js'],
  setupFilesAfterEnv: ['jest-expect-message'],
};

export default config;
