import { describe, expect, it } from 'vitest';
import {
  NAME_MAX_LENGTH,
  RAT_SURNAMES,
  RAT_TITLES,
  generateRandomName,
} from '../../src/shared/ratNames';

describe('rat names', () => {
  it('keeps every title and surname pairing within the name cap', () => {
    expect(RAT_TITLES).toHaveLength(12);
    expect(RAT_SURNAMES).toHaveLength(88);
    expect(new Set(RAT_TITLES).size).toBe(RAT_TITLES.length);
    expect(new Set(RAT_SURNAMES).size).toBe(RAT_SURNAMES.length);

    for (const title of RAT_TITLES) {
      for (const surname of RAT_SURNAMES) {
        const name = `${title} ${surname}`;
        expect(name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
        expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      }
    }
  });

  it('picks a title and surname from the banks', () => {
    expect(generateRandomName(() => 0)).toBe('Detective Whisker');
    expect(generateRandomName(() => 0.999)).toBe('Operative Trapnell');
  });
});
