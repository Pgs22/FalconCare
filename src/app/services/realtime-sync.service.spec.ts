import { RealtimeSyncService } from './realtime-sync.service';

describe('RealtimeSyncService payload mapping', () => {
  it('maps single topic payload', () => {
    const service = new RealtimeSyncService();
    expect(service.mapTopicsFromServerPayload('{"topic":"allergies.changed"}')).toEqual([
      'allergies.changed',
    ]);
  });

  it('maps topics array payload', () => {
    const service = new RealtimeSyncService();
    expect(
      service.mapTopicsFromServerPayload(
        '{"topics":["appointments.changed","patients.changed","appointments.changed"]}'
      )
    ).toEqual(['appointments.changed', 'patients.changed']);
  });

  it('maps legacy entity/type payload', () => {
    const service = new RealtimeSyncService();
    expect(service.mapTopicsFromServerPayload('{"entity":"patient","type":"updated"}')).toEqual([
      'patients.changed',
    ]);
    expect(service.mapTopicsFromServerPayload('{"entity":"allergy"}')).toEqual(['allergies.changed']);
  });
});
