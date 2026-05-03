import { describe, expect, it } from 'vitest';

import { SliceCutsValidator, type SliceCutSource } from './SliceCutsValidator';

const sources: readonly SliceCutSource[] = [{ height: 100 }, { height: 50 }];

describe('SliceCutsValidator', () => {
  it('accepts strictly increasing cuts inside bounds', () => {
    expect(() => new SliceCutsValidator().validate(sources, [1, 100, 149])).not.toThrow();
  });

  it('rejects duplicate cuts', () => {
    expect(() => new SliceCutsValidator().validate(sources, [50, 50])).toThrow(
      'Cuts must be strictly increasing',
    );
  });

  it('rejects unsorted cuts', () => {
    expect(() => new SliceCutsValidator().validate(sources, [80, 50])).toThrow(
      'Cuts must be strictly increasing',
    );
  });

  it('rejects negative cuts', () => {
    expect(() => new SliceCutsValidator().validate(sources, [-1])).toThrow(
      'Cut -1 is outside valid range: 1..149.',
    );
  });

  it('rejects zero cut', () => {
    expect(() => new SliceCutsValidator().validate(sources, [0])).toThrow(
      'Cut 0 is outside valid range: 1..149.',
    );
  });

  it('rejects cut equal to total height', () => {
    expect(() => new SliceCutsValidator().validate(sources, [150])).toThrow(
      'Cut 150 is outside valid range: 1..149.',
    );
  });

  it('rejects non-integer cuts', () => {
    expect(() => new SliceCutsValidator().validate(sources, [1.5])).toThrow(
      'Cut must be an integer pixel position, got 1.5.',
    );
  });
});
