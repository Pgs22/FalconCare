# FalconCare – Frontend (Angular)

## 📌 Descripción general

**FalconCare** es una aplicación web desarrollada como proyecto final del módulo **MP0616 (DAW2)**, orientada a simular la operativa real de una **clínica odontológica** en un entorno educativo. El objetivo principal es ofrecer una herramienta digital que permita a alumnos y docentes trabajar sobre un flujo clínico realista, desde la **primera visita del paciente** hasta la **gestión de citas y recursos**.

Este repositorio contiene exclusivamente el **frontend**, desarrollado con **Angular**, encargado de la interfaz de usuario, la navegación y la interacción con los distintos módulos clínicos de la aplicación.

El proyecto está desarrollado por el equipo **Speed Falcons** y tiene como fecha de finalización prevista el **22/05/2026**.

---

## 🎯 Objetivos del frontend

El frontend tiene como finalidad:

* Proporcionar una **interfaz clara, moderna y accesible**.
* Simular un **entorno clínico real** para prácticas formativas.
* Facilitar la **navegación fluida** entre los distintos módulos.
* Representar visualmente la información clínica de forma estructurada.
* Servir como base escalable para futuras ampliaciones del proyecto.

---

## 🧩 Funcionalidades principales

El frontend implementa las siguientes vistas y módulos:

* **Dashboard (Panel de control clínico)**
  Resumen de la actividad diaria: citas, boxes, alertas relevantes y accesos rápidos.

* **Gestión de pacientes**
  Alta de nuevos pacientes y acceso a su información clínica.

* **Formulario de primera visita**
  Recopilación de datos personales, información de contacto y motivo de consulta.

* **Odontograma interactivo**
  Representación gráfica de la dentición, con interacción por diente y cara dental, codificación por colores y registro visual de patologías y tratamientos.

* **Historial clínico**
  Visualización cronológica de antecedentes, alergias, medicación y evolución del paciente.

* **Agenda de citas**
  Vista semanal y diaria de las citas, asignación de boxes y profesionales.

* **Repositorio de radiografías**
  Visualización de imágenes radiológicas asociadas al paciente.

---

## 🛠️ Tecnologías utilizadas

* **Angular** (framework principal del frontend)
* **TypeScript**
* **HTML5**
* **CSS3**
* Arquitectura basada en **componentes standalone**

---

## 📁 Estructura general del proyecto

La aplicación sigue una estructura modular típica de Angular:

* `src/app/components` → Componentes reutilizables (header, sidebar, etc.)
* `src/app/pages` → Vistas principales de la aplicación
* `src/app/services` → Servicios de comunicación y lógica compartida
* `src/app/models` → Modelos de datos

Esta organización permite una mayor mantenibilidad, escalabilidad y claridad del código.

---

## 🔗 Integración con el backend

El frontend está diseñado para consumir una **API REST**, encargada de la lógica de negocio y la persistencia de datos.

Las responsabilidades del frontend se limitan a:

* Mostrar datos recibidos desde la API.
* Gestionar formularios y validaciones básicas.
* Controlar la navegación y la experiencia de usuario.

---

## ♿ Accesibilidad y diseño

La interfaz se ha diseñado teniendo en cuenta:

* Principios de **usabilidad**.
* Contrastes adecuados y jerarquía visual clara.
* Navegación intuitiva mediante sidebar y breadcrumbs.
* Base preparada para cumplir estándares de accesibilidad (WCAG).

---

## 🚀 Instalación y ejecución

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Pgs22/FalconCare.git
   ```

2. Instalar dependencias:

   ```bash
   npm install
   ```

3. Ejecutar la aplicación en entorno de desarrollo:

   ```bash
   ng serve
   ```

4. Acceder desde el navegador:

   ```
   http://localhost:4200
   ```

---

## 📌 Estado del proyecto

🔧 **En desarrollo**
El proyecto se encuentra en fase activa de desarrollo y puede sufrir cambios estructurales y funcionales conforme avanza el curso.

Este README se actualizará a medida que se incorporen nuevas funcionalidades o se modifique la arquitectura del sistema.

---

## 👥 Equipo de desarrollo

* Adrián Palma
* Patricia
* Maxime

**Equipo:** Speed Falcons

---

## 📄 Licencia

Proyecto desarrollado con fines **educativos** dentro del ciclo formativo DAW2.

Su uso y redistribución quedan limitados al contexto académico, salvo indicación expresa.
