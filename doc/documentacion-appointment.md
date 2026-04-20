# Documentacion Appointment

Esta documentacion describe el contrato actual que la agenda de Angular consume del backend Symfony para listar citas, crear citas, cerrar citas y pintar alergias y limpieza de box.

## 1) Endpoints

- `GET /api/appointment/index?date=YYYY-MM-DD`
- `GET /api/appointment/setup-appointment-form?date=YYYY-MM-DD`
- `POST /api/appointment/new`
- `POST /api/appointment/{id}/close`
- `GET /api/patients`
- `POST /api/patients/new`
- `GET /api/treatments/patient/{patientId}`

## 2) Contrato de cita

La UI de agenda consume citas con estos campos principales:

- `id`
- `time`
- `duration`
- `cleaningTime`
- `totalBlockTime`
- `status`
- `patientName`
- `doctorName`
- `boxId`
- `box`
- `reason`
- `color`
- `isUrgency`
- `isFirstVisit`

Reglas visuales:

- `color` define el borde y el estado visual.
- `cleaningTime` representa los minutos de limpieza de box despues de la cita.
- La vista del dia pinta cada cita segun su hora y duracion.
- La limpieza se pinta como bloque independiente justo despues de la cita.

## 3) Vista del dia en Angular

La agenda diaria usa:

- `hourSlotHeightPx` para escalar visualmente el tiempo.
- `dayHours` para mostrar el eje horario.
- `getAppointmentTopPx()` y `getAppointmentHeightPx()` para posicionar cada cita.
- `getCleaningTopPx()` y `getCleaningHeightPx()` para posicionar la limpieza.
- `dayAllergySummary` para mostrar la tabla de alergias unicas del dia.

### 3.1 Tabla de alergias del dia

La vista del dia muestra una tabla con:

- Al·lèrgia
- Pacients
- Llista de pacients

Reglas:

- No repite alergias.
- Agrupa por nombre de alergia.
- Calcula los pacientes citados ese dia que comparten cada alergia.

### 3.2 Alerta clinica

Si el paciente seleccionado tiene alergias, la agenda muestra:

- `iMPORTANT: Pacient amb alergies! Es recomana cita a última hora`

Tambien muestra el texto de alergias en rojo.

## 4) Flujo de alta de paciente

En la agenda, el boton de nuevo paciente abre:

- `/patient-register?returnUrl=/appointments`

En el formulario de alta de paciente:

- Se pueden marcar alergias con checkboxes.
- Se guarda `selectedAllergies` + `allergiesBitmask`.
- Al volver, el boton de regreso usa `returnUrl` para retornar a citas.

## 5) Reglas funcionales

1. El resumen diario de alergias se deriva de las citas cargadas del dia.
2. El flujo de alta de paciente desde citas no deja el formulario de cita en un estado intermedio.
3. Las alergias seleccionadas son legibles tanto en texto como por bitmask.
4. La agenda puede obtener pacientes y tratamientos para el alta rapida.

## 6) Fuentes en el frontend

- `src/app/pages/appointment/appointment.ts`
- `src/app/pages/appointment/appointment.html`
- `src/app/pages/appointment/appointment.css`
- `src/app/services/appointment.service.ts`
- `src/app/models/appointment-api.util.ts`
- `src/app/interceptors/auth.interceptor.ts`