IDIOMAS = {
    "es": "español",
    "en": "inglés",
    "pt": "portugués",
    "fr": "francés",
    "it": "italiano",
    "de": "alemán",
    "ja": "japonés",
    "zh": "chino",
    "ru": "ruso",
}


def normalizar_idioma(entrada: str) -> str | None:
    """Devuelve el código de un idioma admitido a partir de su nombre o código."""
    valor = entrada.strip().casefold()
    for codigo, nombre in IDIOMAS.items():
        if valor in (codigo, nombre.casefold()):
            return codigo
    return None
