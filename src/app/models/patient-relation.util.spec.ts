import {
  belongsToPatientRelation,
  belongsToPatientRelationStrict,
  extractPatientIdFromApiRef,
} from './patient-relation.util';

describe('extractPatientIdFromApiRef', () => {
  it('extrae el id sin confundir 1 con 11', () => {
    expect(extractPatientIdFromApiRef('http://localhost/api/patients/1')).toBe(1);
    expect(extractPatientIdFromApiRef('http://localhost/api/patients/11')).toBe(11);
    expect(extractPatientIdFromApiRef('http://localhost/api/patients/1')).not.toBe(11);
  });
});

describe('belongsToPatientRelationStrict', () => {
  const pid = 1;

  it('rechaza IRI de paciente 11 cuando se pide paciente 1', () => {
    const row = { patient: 'http://127.0.0.1:8000/api/patients/11' };
    expect(belongsToPatientRelationStrict(row, pid)).toBe(false);
  });

  it('acepta IRI exacto del paciente', () => {
    const row = { patient: 'http://127.0.0.1:8000/api/patients/1' };
    expect(belongsToPatientRelationStrict(row, pid)).toBe(true);
  });

  it('acepta objeto JSON-LD con @id', () => {
    const row = { patient: { '@id': '/api/patients/1' } };
    expect(belongsToPatientRelationStrict(row, pid)).toBe(true);
  });

  it('sin referencia al paciente, no acepta', () => {
    expect(belongsToPatientRelationStrict({ description: 'x' }, pid)).toBe(false);
  });

  it('acepta patient_id numérico', () => {
    expect(belongsToPatientRelationStrict({ patient_id: 1 }, pid)).toBe(true);
  });
});

describe('belongsToPatientRelation (citas)', () => {
  it('no hace match laxo 1 vs 11 en string IRI', () => {
    const row = { patient: 'http://localhost/api/patients/11' };
    expect(belongsToPatientRelation(row, 1)).toBe(false);
  });
});
