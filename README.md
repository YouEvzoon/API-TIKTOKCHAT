# TikTok Live TTS Personal API

API local en Node.js para uso personal: puedes conectar varios streamers y leer chat de TikTok Live. La lectura en voz queda en el navegador.

## Estructura

- `index.js`: entrypoint ejecutable del backend
- `src/app.js`: arranque de Express y bootstrap
- `src/config.js`: variables de entorno y config central
- `src/routes/streamers.js`: rutas HTTP de la API
- `src/services/streamerManager.js`: logica de streamers, reconexion y cola TTS
- `src/services/ttsService.js`: motor de voz del sistema
- `src/utils/text.js`: sanitizacion y normalizacion de texto

## Requisitos

- Node.js 18 o superior
- Tener lives activos en las cuentas que vas a leer
- Instalar dependencias con `npm install`

## Inicio rapido

1. Instala dependencias:

   ```bash
   npm install
   ```

2. (Opcional) configura streamers iniciales:

   ```bash
   set TIKTOK_USERNAMES=streamer1,streamer2
   ```

   Tambien puedes usar un solo streamer:

   ```bash
   set TIKTOK_USERNAME=streamer1
   ```

   Si quieres que se conecten solos al arrancar, activa esto:

   ```bash
   set AUTO_BOOTSTRAP_USERS=true
   ```

   Por defecto queda desactivado para evitar conexiones automáticas al iniciar.

3. (Opcional) protege tu API con key:

   ```bash
   set API_KEY=mi_clave_super_privada
   ```

4. Arranca la app:

   ```bash
   npm start
   ```

El archivo `index.js` queda solo como ejecutable para iniciar el backend; toda la logica vive dentro de `src/` para que puedas agregar luego el frontend encima sin ensuciar el punto de entrada.

## Endpoints principales

- `GET /health`: estado general
- `GET /streamers`: lista streamers activos
- `POST /streamers`: agregar streamer
- `DELETE /streamers/:id`: eliminar streamer
- `POST /streamers/:id/connect`: forzar conexion
- `POST /streamers/:id/disconnect`: desconectar
- `GET /streamers/:id/messages`: ver mensajes recientes
- `POST /streamers/:id/speak`: ya no se usa; la voz corre en el frontend

Compatibilidad (modo anterior):

- `GET /messages`: mensajes del streamer por defecto
- `POST /speak`: TTS manual del streamer por defecto (o usando `streamerId`)

## Ejemplos de uso

Agregar streamer:

```bash
curl -X POST http://localhost:3000/streamers \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"kingpol_yt\"}"
```

Hablar texto en un streamer especifico:

```bash
curl -X POST http://localhost:3000/streamers/kingpol_yt/speak \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"hola chat\"}"
```

Si `API_KEY` esta activa, agrega header:

```bash
-H "x-api-key: mi_clave_super_privada"
```

## Variables de entorno

- `PORT`: puerto de la API local (default `3000`)
- `API_KEY`: si existe, exige `x-api-key` en todas las rutas
- `TIKTOK_USERNAMES`: lista separada por coma de usuarios iniciales
- `TIKTOK_USERNAME`: fallback para un solo usuario inicial
- `AUTO_BOOTSTRAP_USERS`: `true` para conectar usuarios iniciales al arrancar, `false` por defecto
- `SPEECH_RATE`: velocidad de voz (default `1.0`)
- `MAX_TEXT_LENGTH`: longitud maxima hablada (default `120`)
- `MAX_RECENT_MESSAGES`: buffer por streamer (default `100`)
- `MANUAL_SPEAK_COOLDOWN_MS`: cooldown de `/speak` (default `1500`)
- `CHAT_POLL_INTERVAL_MS`: intervalo base del chat en la UI web (default `8000`)
- `RECONNECT_BASE_MS`: base de backoff (default `15000`)
- `RECONNECT_MAX_MS`: maximo backoff (default `600000`)
- `MAX_RETRIES_BEFORE_PAUSE`: reintentos antes de pausa (default `8`)
- `PAUSE_AFTER_MAX_RETRIES_MS`: pausa anti-bloqueo (default `1800000`)
- `RECONNECT_JITTER_RATIO`: jitter del backoff (default `0.2`)

## Notas importantes

- Esta integracion usa libreria no oficial (`tiktok-live-connector`). Puede romperse si TikTok cambia su plataforma.
- No hay cuota oficial fija documentada; el riesgo de bloqueo depende de patron de reconexion, IP y volumen.
- Esta API aplica reconexion con backoff y pausa para reducir bloqueos en uso continuo.
- La lectura en voz depende del navegador abierto en la pagina web.
