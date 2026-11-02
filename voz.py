from pathlib import Path
from tempfile import NamedTemporaryFile

import pyttsx3


VELOCIDAD_VOZ = 150


def generar_audio(texto: str, idioma: str = "es") -> Path:
    # genera un wav a partir de un texto, devuelve la ruta del archivo generado
    if not texto.strip():
        raise ValueError("El texto para generar el audio no puede estar vacío.")

    with NamedTemporaryFile(suffix=".wav", delete=False) as archivo:
        ruta_audio = Path(archivo.name)

    try:
        motor = pyttsx3.init()
        voces = motor.getProperty("voices")
        voz_seleccionada = None
        codigo_idioma = idioma.casefold()
        for voz in voces:
            for idioma_voz in voz.languages:
                if isinstance(idioma_voz, bytes):
                    idioma_voz = idioma_voz.decode("utf-8", errors="ignore")
                idioma_voz = idioma_voz.lstrip("\x05").replace("_", "-").casefold()
                if idioma_voz == codigo_idioma or idioma_voz.startswith(
                    f"{codigo_idioma}-"
                ):
                    voz_seleccionada = voz
                    break
            if voz_seleccionada is not None:
                break

        if voz_seleccionada is not None:
            motor.setProperty("voice", voz_seleccionada.id)
        motor.setProperty("rate", VELOCIDAD_VOZ)
        motor.save_to_file(texto, str(ruta_audio))
        motor.runAndWait()

        if not ruta_audio.is_file() or ruta_audio.stat().st_size == 0:
            raise RuntimeError("La síntesis de voz no generó un archivo de audio.")

        return ruta_audio
    except Exception:
        ruta_audio.unlink(missing_ok=True)
        raise
