import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getHashState, TEST_ONLY } from './nav';

const { getPrefixUrls, alignHistoryStack } = TEST_ONLY;

describe('nav module', () => {
  let pushStateStub: sinon.SinonStub;
  let replaceStateStub: sinon.SinonStub;
  let goStub: sinon.SinonStub;
  let setItemStub: sinon.SinonStub;

  beforeEach(() => {
    pushStateStub = sinon.stub(window.history, 'pushState');
    replaceStateStub = sinon.stub(window.history, 'replaceState');
    
    // Simulate window.history.go by triggering a popstate asynchronously
    goStub = sinon.stub(window.history, 'go').callsFake((delta?: number) => {
      setTimeout(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      }, 0);
    });
    setItemStub = sinon.stub(window.sessionStorage, 'setItem');
  });

  afterEach(() => {
    pushStateStub.restore();
    replaceStateStub.restore();
    goStub.restore();
    setItemStub.restore();
  });

  describe('getHashState', () => {
    it('parses empty url', () => {
      const state = getHashState('http://example.com/');
      expect(state.path).to.deep.equal([]);
      expect(Array.from(state.params.entries())).to.deep.equal([]);
    });

    it('parses hash path and query params', () => {
      const state = getHashState('http://example.com/#my/path?foo=bar&baz=1');
      expect(state.path).to.deep.equal(['my', 'path']);
      expect(state.params.get('foo')).to.equal('bar');
      expect(state.params.get('baz')).to.equal('1');
    });
  });

  describe('getPrefixUrls', () => {
    it('generates correct prefix urls for path with parameters', () => {
      const baseUrl = window.location.href.replace(/(#.*)?$/, '');
      const state = getHashState(`${baseUrl}#a/b/c?d=dialogParam&e=normalParam`);
      
      const urls = getPrefixUrls(state);
      // The pushable parameter 'd' triggers separate pushed history states.
      // So we expect path components and pushable query strings as separate arrays.
      expect(urls).to.be.an('array');
      expect(urls.length).to.be.greaterThan(0);
      
      // Should include the base url, base#a, base#a/b, base#a/b/c?e=normalParam, base#a/b/c?e=normalParam&d=dialogParam
      expect(urls[0]).to.equal(baseUrl);
      expect(urls[urls.length - 1]).to.equal(`${baseUrl}#a/b/c?e=normalParam&d=dialogParam`);
      expect(urls[urls.length - 2]).to.equal(`${baseUrl}#a/b/c?e=normalParam`);
    });
  });

  describe('alignHistoryStack', () => {
    const baseUrl = window.location.href.replace(/(#.*)?$/, '');

    it('trims stack and correctly clears forward browser history when appending', async () => {
      const initStack = {
        index: 2,
        entries: [
          { index: 0, url: baseUrl },
          { index: 1, url: `${baseUrl}#a` },
          { index: 2, url: `${baseUrl}#a/b` },
        ]
      };
      
      // Target state is shorter than current stack to verify forward history clearing
      const targetState = getHashState(`${baseUrl}#a`);
      
      await alignHistoryStack(initStack, targetState, false);
      
      // Because we cleared forward history, alignHistoryStack jumps back to replace then push
      // Thus, it will result in at least one pushState call or a jump.
      expect(goStub.called).to.be.true;
      
      const delta = goStub.firstCall.args[0];
      expect(delta).to.equal(-2); // jump from index 2 to index 0
      
      // It should have replaced at index 0 and pushed index 1 to definitively clear forward history
      expect(replaceStateStub.called).to.be.true;
      expect(pushStateStub.called).to.be.true;
      
      expect(initStack.entries).to.have.lengthOf(2);
      expect(initStack.index).to.equal(1);
    });

    it('replaces immediately without pushing if branch leaves no forward history', async () => {
      const initStack = {
        index: 1,
        entries: [
          { index: 0, url: baseUrl },
          { index: 1, url: `${baseUrl}#a` },
        ]
      };
      
      const targetState = getHashState(`${baseUrl}#b`);
      await alignHistoryStack(initStack, targetState, false);
      
      // Go index should be to replace the last branch #a with #b
      // Diff index is 1, jumps to 1. Since stack.index is 1, delta is 0.
      // go(0) bypasses window.history.go
      expect(goStub.called).to.be.false;
      
      // Since it's changing the last element where length is 2 and diff is 1,
      // it replaces rather than jumping to 0 to do clear history (as there is none)
      expect(replaceStateStub.calledWith({ index: 1 }, '', sinon.match(/#b/))).to.be.true;
      
      expect(initStack.entries).to.have.lengthOf(2);
      expect(initStack.entries[1].url.endsWith('#b')).to.be.true;
    });

    it('appends accurately to a completely novel suffix string', async () => {
      const initStack = {
        index: 1,
        entries: [
          { index: 0, url: baseUrl },
          { index: 1, url: `${baseUrl}#a` },
        ]
      };
      
      const targetState = getHashState(`${baseUrl}#a/b/c`);
      await alignHistoryStack(initStack, targetState, false);
      
      // Diff idx is 2, caps to length - 1 = 1. Stack index is 1, delta 0.
      expect(goStub.called).to.be.false;
      
      expect(replaceStateStub.called).to.be.true;
      // Because length diff is >= 2, we expect two appends (pushes)
      expect(pushStateStub.callCount).to.equal(2);
      
      expect(initStack.entries).to.have.lengthOf(4);
      expect(initStack.index).to.equal(3);
    });
  });
});
