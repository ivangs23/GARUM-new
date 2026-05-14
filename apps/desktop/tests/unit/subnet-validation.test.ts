import { describe, it, expect } from 'vitest';
import { isValidSubnetPrefix } from '../../src/main/printer/discovery';

describe('isValidSubnetPrefix', () => {
  it('accepts a valid /24 prefix', () => {
    expect(isValidSubnetPrefix('192.168.1')).toBe(true);
    expect(isValidSubnetPrefix('10.0.0')).toBe(true);
    expect(isValidSubnetPrefix('172.16.42')).toBe(true);
    expect(isValidSubnetPrefix('0.0.0')).toBe(true);
    expect(isValidSubnetPrefix('255.255.255')).toBe(true);
  });

  it('rejects an out-of-range octet', () => {
    expect(isValidSubnetPrefix('192.168.300')).toBe(false);
    expect(isValidSubnetPrefix('256.0.0')).toBe(false);
  });

  it('rejects wrong number of octets', () => {
    expect(isValidSubnetPrefix('192.168')).toBe(false);
    expect(isValidSubnetPrefix('192.168.1.10')).toBe(false);
    expect(isValidSubnetPrefix('192')).toBe(false);
    expect(isValidSubnetPrefix('')).toBe(false);
  });

  it('rejects non-numeric content (shell-injection guard)', () => {
    expect(isValidSubnetPrefix('192.168.1; rm -rf /')).toBe(false);
    expect(isValidSubnetPrefix('192.168.$(whoami)')).toBe(false);
    expect(isValidSubnetPrefix('1.2.a')).toBe(false);
    expect(isValidSubnetPrefix('1.2.-1')).toBe(false);
  });

  it('rejects leading zeros and whitespace', () => {
    // Permitido por parser numérico pero queremos forma canónica
    expect(isValidSubnetPrefix(' 192.168.1')).toBe(false);
    expect(isValidSubnetPrefix('192.168.1 ')).toBe(false);
  });
});
