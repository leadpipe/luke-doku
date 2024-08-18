import {FAKE_HISTORY, FAKE_HISTORY_SERIALIZED} from './fake-data';
import {deserializeCommands, serializeCommands} from './serialize';

describe('serialize', () => {
  it('serializing works', () => {
    expect(serializeCommands(FAKE_HISTORY)).toEqual(FAKE_HISTORY_SERIALIZED);
  });

  it('deserializing works', () => {
    expect(deserializeCommands(FAKE_HISTORY_SERIALIZED)).toEqual(FAKE_HISTORY);
  });
});
