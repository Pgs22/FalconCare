import { parseJwtPayload, resolveClinicalUserDisplayName } from './clinical-user-display.util';

describe('clinical-user-display.util', () => {
  it('parseJwtPayload returns null for empty token', () => {
    expect(parseJwtPayload(null)).toBeNull();
    expect(parseJwtPayload('')).toBeNull();
  });

  it('resolveClinicalUserDisplayName prefers full name', () => {
    expect(
      resolveClinicalUserDisplayName({ name: '  Ana García  ' }, 'Usuario'),
    ).toBe('Ana García');
  });

  it('resolveClinicalUserDisplayName falls back to email prefix', () => {
    expect(
      resolveClinicalUserDisplayName({ email: 'doctor.falcon@clinic.test' }, 'Usuario'),
    ).toBe('Doctor Falcon');
  });
});
