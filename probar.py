from api_IA import client
from api_IA import nexus1


completion = client.chat.completions.create(
    messages=[
        {
            "role": "user",
            "content": "Hola. Respondé brevemente.",
        }
    ],
    model="openai/gpt-oss-20b",
)

print(completion.choices[0].message.content)

ejemplo_pregunta = "¿cuáles son los principales gases de efecto invernadero?"
response = nexus1(ejemplo_pregunta)
print(response)
segunda_pregunta = "¿Y cómo afecta a Argentina?"
response2 = nexus1(segunda_pregunta)
print(response2)
