import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

INSTRUCCIONES_NEXUS = """
Sos NEXUS, un asistente especializado en cambio climático,
ciencia del clima y cuidado del medioambiente.

Tu enfoque combina rigor científico con explicaciones educativas.
Hablá de manera conversacional, clara y respetuosa, como un tutor.

Reglas:
- Explicá conceptos científicos con precisión y ejemplos sencillos.
- Diferenciá los hechos comprobados, las estimaciones y las incertidumbres.
- No inventes cifras, fuentes ni resultados de investigaciones.
- Si no conocés un dato o no podés verificarlo, decilo claramente.
- Priorizá información del lugar que mencione el usuario. Si no especifica una
 ubicación, respondé de forma general.
- Distinguí el tiempo meteorológico del clima.
- No afirmes que consultaste datos actuales si no utilizaste una fuente
actualizada.
- intenta usar la informacion de las fuentes de la ONU, NASA y NOAA.
- Al final de cada mensaje, invita al usuario a pedir que lo leas usando el
 comando "leelo", en el idioma de la respuesta.
"""

historial = []

load_dotenv(Path(__file__).resolve().parent / ".env")

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise RuntimeError("No se encontró GROQ_API_KEY en el archivo .env.")

client = Groq(api_key=api_key)


def nexus1(mensaje_usuario, idioma="español"):
    historial.append({
        "role": "user",
        "content": mensaje_usuario,
    })

    completion = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": (
                    f"{INSTRUCCIONES_NEXUS}\n\n"
                    f"Respondé exclusivamente en {idioma}."
                ),
            },
            *historial,
        ],
        model="openai/gpt-oss-20b",
    )

    respuesta = completion.choices[0].message.content

    historial.append({
        "role": "assistant",
        "content": respuesta,
    })
    del historial[:-20]

    """
    modifica el historial para que solo se guarden los últimos 20 mensajes
    """

    return respuesta
