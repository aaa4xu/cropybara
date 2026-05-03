import { describe, expect, it } from 'vitest';

import { Crc32 } from './Crc32';

describe('Crc32', () => {
  it('matches the standard check value', () => {
    const crc32 = new Crc32();

    crc32.update(new TextEncoder().encode('123456789'));

    expect(crc32.digest()).toBe(0xcbf43926);
  });

  it('matches when input arrives across uneven chunks', () => {
    const complete = new Crc32();
    const chunked = new Crc32();
    const bytes = new TextEncoder().encode('cropybara zip crc32 benchmark payload');

    complete.update(bytes);
    chunked.update(bytes.subarray(0, 1));
    chunked.update(bytes.subarray(1, 9));
    chunked.update(bytes.subarray(9, 17));
    chunked.update(bytes.subarray(17));

    expect(chunked.digest()).toBe(complete.digest());
  });
});
