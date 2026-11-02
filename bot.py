import os
import asyncio
import logging
import discord
from discord.ext import commands
from dotenv import load_dotenv

from api_IA import nexus1
from idiomas import IDIOMAS
from voz import generar_audio

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(
    command_prefix="!",
    intents=intents
)

ultimas_respuestas: dict[int, tuple[str, str]] = {}
idiomas_por_usuario: dict[int, str] = {}


class SelectorIdioma(discord.ui.Select):
    def __init__(self, usuario_id: int, pregunta: str):
        opciones = [
            discord.SelectOption(label=nombre.title(), value=codigo)
            for codigo, nombre in IDIOMAS.items()
        ]
        super().__init__(
            placeholder="Seleccioná tu idioma...",
            options=opciones,
        )
        self.usuario_id = usuario_id
        self.pregunta = pregunta

    async def callback(self, interaction: discord.Interaction):
        codigo_idioma = self.values[0]
        idiomas_por_usuario[self.usuario_id] = codigo_idioma
        await interaction.response.edit_message(
            content=f"Idioma elegido: {IDIOMAS[codigo_idioma]}. Estoy preparando tu respuesta...",
            view=None,
        )

        try:
            respuesta = await asyncio.to_thread(
                nexus1, self.pregunta, IDIOMAS[codigo_idioma]
            )
            if not respuesta:
                raise RuntimeError("NEXUS no devolvió una respuesta.")
        except Exception:
            logging.exception("No se pudo generar la respuesta de NEXUS.")
            await interaction.followup.send(
                "No pude generar una respuesta. Revisá los registros del bot."
            )
            return

        if interaction.channel_id is not None:
            ultimas_respuestas[interaction.channel_id] = (
                respuesta,
                codigo_idioma,
            )
        for i in range(0, len(respuesta), 1900):
            await interaction.followup.send(respuesta[i:i + 1900])


class SelectorIdiomaView(discord.ui.View):
    def __init__(self, usuario_id: int, pregunta: str):
        super().__init__(timeout=300)
        self.usuario_id = usuario_id
        self.add_item(SelectorIdioma(usuario_id, pregunta))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.usuario_id:
            await interaction.response.send_message(
                "Este selector de idioma pertenece a otra persona.",
                ephemeral=True,
            )
            return False
        return True


@bot.event
async def on_ready():
    print(f"NEXUS está conectado como {bot.user}")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    await bot.process_commands(message)

    if message.content.strip().casefold() == "leelo":
        ultima_respuesta = ultimas_respuestas.get(message.channel.id)
        if ultima_respuesta is None:
            await message.channel.send("Todavía no hay una respuesta para leer en este canal.")
            return

        respuesta, idioma_respuesta = ultima_respuesta
        try:
            ruta_audio = await asyncio.to_thread(
                generar_audio, respuesta, idioma_respuesta
            )
        except Exception:
            logging.exception("No se pudo generar el audio de la respuesta.")
            await message.channel.send("No pude generar el audio. Revisá los registros del bot.")
            return

        try:
            await message.channel.send(
                file=discord.File(ruta_audio, filename="respuesta.wav")
            )
        finally:
            ruta_audio.unlink(missing_ok=True)
        return

    if message.author.id not in idiomas_por_usuario:
        await message.channel.send(
            f"{message.author.mention}, elegí en qué idioma querés conversar:",
            view=SelectorIdiomaView(message.author.id, message.content),
        )
        return

    texto = message.content
    codigo_idioma = idiomas_por_usuario.get(message.author.id, "es")
    idioma = IDIOMAS[codigo_idioma]
    respuesta = await asyncio.to_thread(nexus1, texto, idioma)
    ultimas_respuestas[message.channel.id] = (respuesta, codigo_idioma)
    for i in range(0, len(respuesta), 1900):
        await message.channel.send(respuesta[i:i + 1900])

if not TOKEN:
    raise RuntimeError("No se encontró DISCORD_TOKEN en .env")


bot.run(TOKEN)
