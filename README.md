# 🚀 Lingo-IA: Tu Tutor de Idiomas Inteligente y en Tiempo Real

Lingo-IA es una aplicación de aprendizaje de idiomas de última generación que ofrece una experiencia de conversación inmersiva y personalizada. Utilizando una arquitectura nativa Speech-to-Speech (Voz-a-Voz) con latencia ultrabaja, Lingo-IA permite una interacción bidireccional fluida con un tutor de IA powered by Gemini 1.5 Flash Multimodal Live.

La IA no solo conversa, sino que gestiona de forma autónoma el progreso del usuario, evalúa la gramática y pronunciación, y actualiza el perfil de aprendizaje en tiempo real.

## ✨ Características Principales

*   **Conversación Voz-a-Voz en Tiempo Real:** Interacción natural y fluida con la IA, sin esperas ni interrupciones.
*   **Gestión Inteligente del Progreso:** La IA detecta automáticamente los temas dominados y los errores comunes, actualizando el perfil del usuario.
*   **Feedback Pedagógico Personalizado:** Resúmenes detallados de cada sesión con puntos clave de mejora y aliento, guardados en el historial de aprendizaje.
*   **Dashboard de Progreso Dinámico:** Visualiza tu nivel actual, habilidades desbloqueadas y feedback del tutor de IA en tiempo real.
*   **Autenticación Segura:** Inicio de sesión con Google utilizando NextAuth.js para una experiencia de usuario segura y sin fricciones.
*   **Procesamiento de Audio de Alto Rendimiento:** Uso de `AudioWorklet` en el frontend para garantizar un procesamiento de audio robusto y sin interrupciones en un hilo separado del navegador.

## 🏛️ Arquitectura

Lingo-IA está construida sobre una arquitectura moderna y escalable:

*   **Frontend:** Next.js (React) con Tailwind CSS para una interfaz de usuario limpia y moderna.
    *   **Captura de Audio:** Web Audio API con `AudioWorklet` para un procesamiento de micrófono eficiente y en tiempo real.
    *   **Comunicación:** WebSockets para el envío y recepción de chunks de audio y datos.
*   **Backend:** Node.js (TypeScript) con un servidor WebSocket.
    *   **IA Core:** Google Gemini 1.5 Flash Multimodal Live para la interacción conversacional.
    *   **Function Calling:** Gemini utiliza herramientas (`Capabilities`) para interactuar con la base de datos (ej. `actualizar_progreso_usuario`, `cambiar_dificultad`).
    *   **Autenticación:** NextAuth.js para la gestión de usuarios y sesiones seguras.
    *   **Persistencia:** Prisma ORM para interactuar con la base de datos PostgreSQL.
*   **Base de Datos:** PostgreSQL para almacenar perfiles de usuario, analíticas de aprendizaje y historial de lecciones.

## 🚀 Configuración y Ejecución

Sigue estos pasos para poner en marcha Lingo-IA en tu entorno local.

### Prerrequisitos

*   **Node.js** (v18 o superior)
*   **npm** o **Yarn**
*   **PostgreSQL** (instancia local o remota, ej. Supabase)
*   **Cuenta de Google Cloud / Google AI Studio:** Necesitarás una `GEMINI_API_KEY` con acceso a `gemini-1.5-flash-latest` (o `gemini-2.0-flash-exp` para la voz optimizada).
*   **Credenciales de Google OAuth:** Para NextAuth.js, necesitarás un `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` configurados en la consola de desarrolladores de Google.

### 1. Configuración de Variables de Entorno

Crea un archivo `.env` en la **raíz de tu proyecto** y configura las siguientes variables:

```env
# Google AI Studio / Gemini API Key
GEMINI_API_KEY="TU_CLAVE_API_DE_GEMINI"

# PostgreSQL Database
DATABASE_URL="postgresql://user:password@localhost:5432/lingo_ia_db"

# NextAuth.js (Genera una clave con `openssl rand -base64 32`)
NEXTAUTH_SECRET="TU_SECRETO_PARA_NEXTAUTH"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth para NextAuth.js
GOOGLE_CLIENT_ID="TU_CLIENT_ID_DE_GOOGLE"
GOOGLE_CLIENT_SECRET="TU_CLIENT_SECRET_DE_GOOGLE"

# Puerto del servidor backend
PORT=8080
```

### 2. Configuración de la Base de Datos (Backend)

Navega al directorio raíz del proyecto en tu terminal.

```bash
# Instala las dependencias del backend (incluyendo Prisma CLI)
npm install

# Aplica las migraciones de Prisma a tu base de datos PostgreSQL
# Asegúrate de que tu `DATABASE_URL` en .env sea correcta.
npx prisma migrate dev --name init-nextauth-models
```
*(Nota: El nombre de la migración `init-nextauth-models` es un ejemplo. Si ya ejecutaste migraciones antes, usa el nombre que corresponda o permite a Prisma sugerir uno.)*

### 3. Ejecutar el Backend (Servidor Node.js)

```bash
# En modo desarrollo (con recarga automática al cambiar archivos .ts)
npm run dev

# Para compilar y ejecutar en producción
# npm run build
# npm start
```
El servidor backend escuchará en `http://localhost:8080` y en la conexión WebSocket `ws://localhost:8080`.

### 4. Ejecutar el Frontend (Aplicación Next.js)

Asegúrate de estar en el directorio raíz de tu proyecto.

```bash
# Instala las dependencias del frontend
npm install

# Ejecuta la aplicación Next.js en modo desarrollo
npm run dev
```
La aplicación Next.js se iniciará en `http://localhost:3000`.

### Uso

1.  Abre tu navegador y navega a `http://localhost:3000/dashboard`.
2.  Haz clic en "Iniciar Sesión con Google" para autenticarte.
3.  Una vez en el dashboard, verás tus datos de progreso. Haz clic en "Empezar a Hablar" para iniciar una sesión de conversación con el tutor de IA.
4.  Observa cómo el indicador de voz reacciona a tu habla y cómo el dashboard se actualiza automáticamente al finalizar la sesión.

## 🚀 Próximos Pasos y Mejoras Potenciales

*   **UI/UX:**
    *   Implementar un componente de chat en tiempo real para ver la transcripción y las respuestas de la IA.
    *   Mejorar la animación del indicador de voz para un feedback más sofisticado.
    *   Añadir más visualizaciones al dashboard (gráficas de progreso, etc.).
*   **Manejo de Errores:**
    *   Mejorar la gestión de errores en el frontend (ej. si el WebSocket se desconecta).
    *   Validación más estricta del JSON devuelto por la IA para el resumen pedagógico.
*   **Características de IA:**
    *   Permitir al usuario seleccionar el tema de la lección o el nivel de dificultad.
    *   Integrar más herramientas (ej. "dar_ejemplo_gramatical", "traducir_palabra").
*   **Escalabilidad:**
    *   Explorar el escalado horizontal del servidor Node.js (ej. con Node.js `cluster` o contenedores).

---

¡Disfruta construyendo el futuro del aprendizaje de idiomas!
# Lingo-IA-Tu-Tutor-de-Idiomas-Inteligente-y-en-Tiempo-Real-
