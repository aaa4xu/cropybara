import { describe, it, expect, beforeEach } from 'vitest';
import { CarvingKnife } from './CarvingKnife';
import type { CarvingKnifeSource } from './CarvingKnifeSource';

describe('CarvingKnife', () => {
  // Mock implementation of CarvingKnifeSource
  class MockSource implements CarvingKnifeSource {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
  }

  let sources: MockSource[];

  beforeEach(() => {
    // Reset sources before each test
    sources = [new MockSource(100, 200), new MockSource(100, 300), new MockSource(100, 250)];
  });

  it('should throw an error if sources array is empty', () => {
    expect(() => CarvingKnife.cut([], [100, 200])).toThrow('Empty sources');
  });

  it('should handle empty cuts array', () => {
    const result = CarvingKnife.cut(sources, []);
    const totalHeight = sources.reduce((acc, src) => acc + src.height, 0);
    expect(result).toEqual([
      {
        chunks: expect.arrayContaining([
          expect.objectContaining({ src: sources[0] }),
          expect.objectContaining({ src: sources[1] }),
          expect.objectContaining({ src: sources[2] }),
        ]),
        height: totalHeight,
        width: 100,
      },
    ]);
  });

  it('should throw an error if cut is beyond total height', () => {
    const totalHeight = sources.reduce((acc, src) => acc + src.height, 0);
    expect(() => CarvingKnife.cut(sources, [totalHeight + 100])).toThrow('Zero height slice');
  });

  it('should handle cuts at source boundaries', () => {
    // Cut exactly at the boundary between first and second source
    const result = CarvingKnife.cut(sources, [200]);

    expect(result.length).toBe(2);

    // First slice should contain only the first source
    expect(result[0].chunks.length).toBe(1);
    expect(result[0].chunks[0].src).toBe(sources[0]);

    // Second slice should contain the second and third sources
    expect(result[1].chunks.length).toBe(2);
    expect(result[1].chunks[0].src).toBe(sources[1]);
    expect(result[1].chunks[1].src).toBe(sources[2]);
  });

  it('should throw error when a chunk would have zero height', () => {
    // Creating a special case where a chunk might end up with zero height
    const specialSources = [
      new MockSource(100, 100),
      new MockSource(100, 0), // This would cause an issue
      new MockSource(100, 100),
    ];

    expect(() => {
      CarvingKnife.cut(specialSources, [100]);
    }).toThrow('Zero height source');
  });

  it('should handle sources with different widths correctly', () => {
    const mixedWidthSources = [
      new MockSource(100, 200),
      new MockSource(150, 300), // Different width
      new MockSource(100, 250),
    ];

    const result = CarvingKnife.cut(mixedWidthSources, [300]);

    // Width should be taken from the first source
    expect(result[0].width).toBe(100);
    expect(result[1].width).toBe(100);
  });

  it('should handle cuts that intersect a source', () => {
    // Cut through the middle of the first source
    const result = CarvingKnife.cut(sources, [100]);

    expect(result.length).toBe(2);

    // First slice should contain part of the first source
    expect(result[0].chunks.length).toBe(1);
    expect(result[0].chunks[0].src).toBe(sources[0]);
    expect(result[0].chunks[0].srcHeight).toBe(100);
    expect(result[0].chunks[0].dstHeight).toBe(100);

    // Second slice should contain part of the first source and the other sources
    expect(result[1].chunks.length).toBe(3);
    expect(result[1].chunks[0].src).toBe(sources[0]);
    expect(result[1].chunks[0].srcY).toBe(100); // Start from position 100 in the source
  });

  it('should handle multiple cuts correctly', () => {
    const result = CarvingKnife.cut(sources, [100, 300, 600]);

    expect(result.length).toBe(4);
    expect(result[0].height).toBe(100);
    expect(result[1].height).toBe(200);
    expect(result[2].height).toBe(300);
    expect(result[3].height).toBe(150); // Remaining height
  });

  it('should handle very large number of cuts', () => {
    // Create a lot of cuts
    const manyCuts = Array.from({ length: 100 }, (_, i) => (i + 1) * 5);
    const result = CarvingKnife.cut(sources, manyCuts);

    expect(result.length).toBe(101); // Cuts + 1
  });

  it('should throw an error if cuts at same position', () => {
    // Duplicate cuts at the same position
    expect(() => CarvingKnife.cut(sources, [200, 200, 400])).toThrow('Zero height slice');
  });
});
