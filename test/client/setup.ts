import { vi } from 'vitest';

// Exercise real Three.js meshes and Cannon physics without a GPU/audio device.
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();
  return {
    ...three,
    Audio: class {
      buffer = null;
      isPlaying = false;
      setBuffer() {}
      setVolume() {}
      play() {}
      stop() {}
      disconnect() {}
    },
    AudioLoader: class { load() {} },
  };
});

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect() {}, strokeText() {}, fillText() {}, fillRect() {},
    }),
  }),
});
