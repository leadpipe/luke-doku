import {CommandTag} from './command';
import {FAKE_HISTORY, FAKE_HISTORY_SERIALIZED} from './fake-data';
import {deserializeCommands, serializeCommands, TEST_ONLY} from './serialize';

const {serializersByTag} = TEST_ONLY;

describe('serialize module', () => {
  it('serializing works', () => {
    expect(serializeCommands(FAKE_HISTORY)).toEqual(FAKE_HISTORY_SERIALIZED);
  });

  it('deserializing works', () => {
    expect(deserializeCommands(FAKE_HISTORY_SERIALIZED)).toEqual(FAKE_HISTORY);
  });

  it(`serializers are indexed correctly`, () => {
    for (const [tag, serializer] of Object.entries(serializersByTag)) {
      expect(CommandTag[Number(tag)]).toBe(CommandTag[serializer.tag]);
    }
  });

  it(`command tags will fit in 7 bits`, () => {
    for (const serializer of Object.values(serializersByTag)) {
      expect(serializer.tag & 127, CommandTag[serializer.tag]).toBe(serializer.tag);
    }
  })
});
