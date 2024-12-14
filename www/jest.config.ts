import type {Config} from '@jest/types';

const config: Config.InitialOptions = {
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['jest-date-mock'],
  setupFilesAfterEnv: ['jest-expect-message'],
};

export default config;
