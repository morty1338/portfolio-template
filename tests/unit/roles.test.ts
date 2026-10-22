import { describe, expect, it } from 'vitest';
import { filtersFor } from '../../src/lib/roles';

describe('filtersFor', () => {
  it('counts a co-director under the director filter', () => {
    expect(filtersFor(['co-director', 'camera', 'editor'])).toEqual(['director', 'editor', 'camera']);
  });

  it('ignores credits that have no filter button', () => {
    expect(filtersFor(['idea', 'editor'])).toEqual(['editor']);
    expect(filtersFor(['styling'])).toEqual([]);
  });
});
