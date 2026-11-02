"""Servidor web de NEXUS.

Reutiliza tus archivos sin modificarlos:
  - api_IA.py   -> nexus1() y el historial global
  - idiomas.py  -> IDIOMAS
  - voz.py      -> generar_audio()

NO importa bot.py (ese archivo arranca el bot de Discord al importarse).
Poné este archivo en la misma carpeta que api_IA.py, idiomas.py y voz.py.
"""
import threading
import time
from collections import defaultdict, deque

from flask import Flask, Response, jsonify, render_template, request

import api_IA  # carga el .env y crea el cliente de Groq
from idiomas import IDIOMAS

# El audio es opcional: si voz.py no está o pyttsx3 no se puede cargar en el
# servidor, el chat sigue funcionando y solo falla el botón de escuchar.
try:
    from voz import generar_audio
except Exception:
    generar_audio = None

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024  # tamaño máximo de cada pedido

MAX_MENSAJE = 2000
MAX_HISTORIAL = 18
MAX_TEXTO_AUDIO = 5000

# api_IA.historial es una lista global compartida por todos los que llamen a
# nexus1(). Para que cada chat tenga su propio historial, el servidor la carga
# con el historial del chat, llama a nexus1() y la vacía. El lock evita que dos
# pedidos pisen la lista al mismo tiempo.
lock_nexus = threading.Lock()
# pyttsx3 no es thread-safe: un audio por vez.
lock_voz = threading.Lock()

# Límite simple por IP (en memoria) para que nadie gaste tu cuota de Groq.
VENTANA_SEG = 60
MAX_PEDIDOS = 15
pedidos = defaultdict(deque)


def limitado() -> bool:
    ahora = time.time()
    cola = pedidos[request.remote_addr]
    while cola and ahora - cola[0] > VENTANA_SEG:
        cola.popleft()
    if len(cola) >= MAX_PEDIDOS:
        return True
    cola.append(ahora)
    return False


def limpiar_historial(crudo) -> list[dict]:
    """Deja solo mensajes válidos del cliente (rol y texto)."""
    if not isinstance(crudo, list):
        return []
    limpio = []
    for item in crudo:
        if not isinstance(item, dict):
            continue
        rol = item.get("role")
        contenido = item.get("content")
        if rol in ("user", "assistant") and isinstance(contenido, str) and contenido:
            limpio.append({"role": rol, "content": contenido[:6000]})
    return limpio[-MAX_HISTORIAL:]


@app.get("/")
def inicio():
    return render_template("index.html", idiomas=IDIOMAS)


@app.post("/api/chat")
def chat():
    if limitado():
        return jsonify(error="Hiciste muchas consultas seguidas. Esperá un minuto y probá de nuevo."), 429

    datos = request.get_json(silent=True) or {}
    mensaje = str(datos.get("mensaje", "")).strip()
    codigo = datos.get("idioma", "es")

    if not mensaje or len(mensaje) > MAX_MENSAJE:
        return jsonify(error=f"El mensaje debe tener entre 1 y {MAX_MENSAJE} caracteres."), 400
    if codigo not in IDIOMAS:
        return jsonify(error="Idioma no admitido."), 400

    historial = limpiar_historial(datos.get("historial"))

    try:
        with lock_nexus:
            api_IA.historial[:] = historial  # se modifica en el lugar: nexus1 usa el mismo objeto
            try:
                respuesta = api_IA.nexus1(mensaje, IDIOMAS[codigo])
            finally:
                api_IA.historial.clear()
    except Exception:
        app.logger.exception("Falló la respuesta de NEXUS")
        return jsonify(error="No pude generar una respuesta. Probá de nuevo en un momento."), 502

    if not respuesta:
        return jsonify(error="NEXUS no devolvió una respuesta."), 502
    return jsonify(respuesta=respuesta)


@app.post("/api/audio")
def audio():
    if limitado():
        return jsonify(error="Hiciste muchas consultas seguidas. Esperá un minuto y probá de nuevo."), 429

    if generar_audio is None:
        return jsonify(error="El audio no está disponible en este servidor."), 503

    datos = request.get_json(silent=True) or {}
    texto = str(datos.get("texto", "")).strip()[:MAX_TEXTO_AUDIO]
    codigo = datos.get("idioma", "es")

    if not texto:
        return jsonify(error="No hay texto para leer."), 400
    if codigo not in IDIOMAS:
        return jsonify(error="Idioma no admitido."), 400

    try:
        with lock_voz:
            ruta = generar_audio(texto, codigo)
        try:
            contenido = ruta.read_bytes()
        finally:
            ruta.unlink(missing_ok=True)
    except Exception:
        app.logger.exception("Falló la generación de audio")
        return jsonify(error="No pude generar el audio."), 500

    return Response(contenido, mimetype="audio/wav")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
