import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from './feedback-message-timing';

/** Límite cliente (2 MB) alineado con validación en doctor-panel y patient-panel. */
export const PROFILE_IMAGE_MAX_BYTES_CLIENT = 2 * 1024 * 1024;

/** Imagen por defecto del perfil (logotipo FalconCare) cuando no hay foto en BD o tras eliminarla. */
export const PROFILE_IMAGE_DEFAULT_URL = '/assets/branding/logo-icon.png';

export type ProfileImageToastKind = 'success' | 'error' | 'pending';

/** Textos unificados para subida de foto (doctor y paciente). */
export const PROFILE_IMAGE_MSG = {
  success: 'Foto de perfil actualizada correctamente.',
  deleteSuccess: 'Foto de perfil eliminada correctamente.',
  deleting: 'Eliminando foto…',
  deleteNothing: 'No hay foto personalizada que eliminar.',
  invalidType: 'Solo se permiten archivos de imagen.',
  tooLargeClient: 'La imagen es demasiado grande (máx. 2 MB).',
  tooLargeOrInvalidServer: 'La imagen es demasiado grande o el formato no es válido.',
  forbidden: 'No tienes permiso para actualizar esta foto.',
  sessionExpired: 'Tu sesión ha expirado. Vuelve a iniciar sesión.',
  genericError: 'No se pudo guardar la imagen. Inténtalo de nuevo.',
  noUserSession: 'No se pudo identificar tu usuario. Vuelve a iniciar sesión.',
  /** Panel paciente: expediente aún no cargado o ruta inválida. */
  noPatientContext: 'No se puede actualizar la foto: datos del paciente no disponibles.',
} as const;

/** Tiempo visible del aviso de foto de perfil antes de ocultarse (ms). Igual que el resto de la app. */
export const PROFILE_IMAGE_TOAST_MS = FEEDBACK_MESSAGE_AUTO_HIDE_MS;

/** Misma lógica en doctor y paciente para errores HTTP del PUT de imagen. */
export function mapProfileImageUploadHttpError(err: unknown): string {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status: unknown }).status)
      : NaN;
  if (Number.isFinite(status)) {
    if (status === 400) {
      return PROFILE_IMAGE_MSG.tooLargeOrInvalidServer;
    }
    if (status === 403) {
      return PROFILE_IMAGE_MSG.forbidden;
    }
    if (status === 401) {
      return PROFILE_IMAGE_MSG.sessionExpired;
    }
  }
  return PROFILE_IMAGE_MSG.genericError;
}
