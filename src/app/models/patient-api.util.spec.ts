import { normalizePatientsFromApi } from './patient-api.util';

describe('patient-api.util', () => {
  it('extracts plain array', () => {
    const rows = normalizePatientsFromApi([
      { id: 1, firstName: 'Ana', lastName: 'López' },
      { id: 2, first_name: 'Bob', last_name: 'Test' },
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(1);
    expect(rows[1].firstName).toBe('Bob');
  });

  it('extracts hydra:member', () => {
    const rows = normalizePatientsFromApi({
      'hydra:member': [{ id: 11, firstName: 'Hydra', lastName: 'Patient' }],
    });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(11);
  });
});
