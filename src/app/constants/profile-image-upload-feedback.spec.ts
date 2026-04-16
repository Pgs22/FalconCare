import {
  PROFILE_IMAGE_MSG,
  mapProfileImageUploadHttpError,
} from './profile-image-upload-feedback';

describe('mapProfileImageUploadHttpError', () => {
  it('mapea 400, 403 y 401', () => {
    expect(mapProfileImageUploadHttpError({ status: 400 })).toBe(
      PROFILE_IMAGE_MSG.tooLargeOrInvalidServer
    );
    expect(mapProfileImageUploadHttpError({ status: 403 })).toBe(PROFILE_IMAGE_MSG.forbidden);
    expect(mapProfileImageUploadHttpError({ status: 401 })).toBe(
      PROFILE_IMAGE_MSG.sessionExpired
    );
  });

  it('usa mensaje genérico para otros códigos o errores desconocidos', () => {
    expect(mapProfileImageUploadHttpError({ status: 500 })).toBe(PROFILE_IMAGE_MSG.genericError);
    expect(mapProfileImageUploadHttpError({ status: 0 })).toBe(PROFILE_IMAGE_MSG.genericError);
    expect(mapProfileImageUploadHttpError(new Error('x'))).toBe(PROFILE_IMAGE_MSG.genericError);
  });
});
