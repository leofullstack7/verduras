# verduras

Prototipo de **Fruver Pedidos**: app web para que restaurantes, hoteles y comercios pidan frutas y verduras, con panel administrador para Olga.

## Uso local

1. Copia `config.example.js` como `config.local.js` y agrega tu API key de OpenAI.
2. Abre `index.html` en el navegador (idealmente con un servidor local estático).

## Credenciales demo

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `olga` | `1234` | Administradora |
| `terraza` | `terraza1` | Restaurante La Terraza |
| `carretero` | `carretero1` | Hotel Carretero |
| `solar` | `solar1` | Gastrobar El Solar |

## Despliegue en Vercel

1. Conecta el repositorio en Vercel.
2. Agrega la variable de entorno `OPENAI_API_KEY` en el proyecto.
3. Vercel ejecutará `scripts/generate-config.js` y servirá `index.html` en la raíz.


- `config.local.js` no se sube a Git (está en `.gitignore`).
- Los datos de la demo se guardan en el almacenamiento del navegador.
