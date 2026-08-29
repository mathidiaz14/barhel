# 🤖 Barhel

> **Asistente de codificación CLI conversacional e interactivo** (estilo OpenCode / Claude Code) para programar directamente desde tu terminal en cualquier carpeta, impulsado por las interfaces web de **DeepSeek**, **ChatGPT** y **Gemini** mediante **Playwright**, sin costo de APIs de pago.

```text
    ____             __          __
   / __ )____ ______/ /_  ___   / /
  / __  / __ `/ ___/ __ \/ _ \ / / 
 / /_/ / /_/ / /  / / / /  __// /  
/_____/\__,_/_/  /_/ /_/\___//_/   
  Autonomous CLI Coding Assistant (Claude Code & OpenCode Style)

📁 Workspace: mi-proyecto (/home/user/proyectos/mi-proyecto)
🛡️  Mode:      SAFE MODE (usa /auto para cambiar)
🤖 Leader:    DeepSeek | Workers: ChatGPT & Gemini
💡 Ayuda:     Escribe tu prompt o usa /help para comandos
════════════════════════════════════════════════════════════════
barhel ❯ 
```

---

## ⚡ Instalación Global (Para usar `barhel` en cualquier carpeta)

### Opción A: Instalación directa con NPM (Recomendado)
```bash
npm install -g barhel
# O directamente desde GitHub:
# npm install -g github:tu-usuario/barhel
```

### Opción B: Instalación local para desarrollo
```bash
git clone <url-del-repo>
cd barhel
npm install
npm run build
npm link
```

---

## ⚙️ Configuración de Modelos (`barhel config`)

Barhel te permite elegir cualquier plataforma web de IA como **Agente Líder (Orquestador principal)** y activar múltiples **Workers de soporte**:

```bash
barhel config
```

### 🌐 Proveedores Web Compatibles:
- 👑/👥 **Claude (Sonnet 3.5 / 3.7)** (`claude.ai`)
- 👑/👥 **DeepSeek (V3 / R1)** (`chat.deepseek.com`)
- 👑/👥 **ChatGPT (GPT-4o / o1)** (`chatgpt.com`)
- 👑/👥 **Gemini (Flash 2.0 / Pro)** (`gemini.google.com`)
- 👑/👥 **Qwen Chat (Qwen 2.5 Coder)** (`chat.qwen.ai`)
- 👑/👥 **Mistral Le Chat (Codestral)** (`chat.mistral.ai`)
- 👥 **Perplexity AI** (`perplexity.ai`)

---

## 🔑 Primer Paso: Autenticación (`login`)

Inicia sesión en las interfaces web de los modelos que vayas a utilizar:

```bash
# Iniciar sesión en un proveedor específico:
barhel login claude
barhel login deepseek
barhel login chatgpt
barhel login gemini
barhel login qwen
barhel login mistral
barhel login perplexity

# O en todos los disponibles:
barhel login all
```

> **Nota:** Se abrirá el navegador Chromium persistente. Inicia sesión en la plataforma y pulsa **Enter** en tu terminal para guardar las cookies y almacenamiento en `~/.dev-agent-sessions/`.

---

---

## 💾 Gestión de Sesiones y Memoria Web

Barhel guarda automáticamente cada sesión en tu máquina y la vincula al **hilo de chat único (`chatUrl`) en la interfaz web del LLM**. Así, el modelo recuerda todo lo que hicieron juntos.

### Reanudar una sesión anterior:
```bash
# Abre el selector visual con la lista de tus sesiones, carpetas y títulos:
barhel resume

# O directamente por ID:
barhel resume <sessionId>
```

### Ver el historial de sesiones guardadas:
```bash
barhel history
```

---

## 🚀 Cómo Usar Barhel

### 1. Iniciar la CLI Interactiva de Chat en tu Carpeta
Entra a cualquier proyecto en tu terminal y escribe simplemente:

```bash
cd /ruta/a/tu/proyecto
barhel
```

### 2. Slash Commands Disponibles en el Chat

Durante tu conversación en Barhel, puedes usar comandos especiales con `/`:

| Comando | Descripción |
| :--- | :--- |
| `/help` | Muestra la lista de comandos disponibles |
| `/resume` o `/history` | Abre el selector visual para saltar a una sesión anterior con todo su contexto |
| `/new [título]` | Inicia una nueva sesión limpia y abre un chat nuevo en el LLM web |
| `/title <texto>` | Renombra el título descriptivo de la sesión actual |
| `/sessions` o `/list` | Muestra el listado de sesiones recientes guardadas en el disco |
| `/config` o `/models` | Cambia interactivamente el modelo Líder y Workers al vuelo |
| `/auto` | Alterna entre **Modo Autónomo** (sin confirmaciones) y **Modo Seguro** (`[y/N]`) |
| `/status` | Comprueba el estado de las credenciales web guardadas |
| `/login [proveedor]` | Inicia sesión en cualquier proveedor sin salir del chat |
| `/clear` | Limpia la pantalla de la terminal |
| `/exit` o `/quit` | Guarda y cierra la sesión de Barhel de forma ordenada |

---

## 🛠️ Ejecución Directa de Instrucciones (Modo Non-Interactive)

Si prefieres ejecutar una tarea directa desde scripts o terminal sin entrar al chat interactivo:

```bash
# Modo seguro (pregunta confirmación interactiva antes de escribir o ejecutar)
barhel "Inspecciona el proyecto y añade TypeScript con tsconfig.json"

# Modo 100% autónomo (-a)
barhel -a "Crea una suite de pruebas unitarias con Vitest y ejecútalas"

# Opciones adicionales
barhel --headless -a -w "./otro-proyecto" "Refactoriza el módulo de autenticación"
```

---

## 📁 Estructura del Código Fuente

```text
barhel/
├── package.json               # Dependencias (Playwright, Commander, Picocolors, Ora)
├── tsconfig.json              # Configuración TypeScript ESM / NodeNext
├── bin/
│   └── run.ts                 # Entrypoint del ejecutable 'barhel'
└── src/
    ├── cli/
    │   └── repl.ts            # Módulo de Chat Interactivo REPL (barhel ❯)
    ├── types/
    │   ├── actions.ts         # Tipos e interfaces ReAct y herramientas
    │   └── providers.ts       # Configuración de URLs y selectores de LLMs
    ├── drivers/
    │   ├── BaseDriver.ts      # Contexto persistente, anti-bot y ciclo de vida
    │   ├── DeepSeekDriver.ts  # Driver web para DeepSeek Chat (Líder)
    │   ├── ChatGPTDriver.ts   # Driver web para ChatGPT (Worker)
    │   └── GeminiDriver.ts    # Driver web para Gemini (Worker)
    ├── engine/
    │   ├── ToolEngine.ts      # Ejecución local de FS y comandos de terminal
    │   ├── ResponseParser.ts  # Extractor y validador resiliente de JSON
    │   └── Orchestrator.ts    # Orquestador del Loop ReAct multi-turno
    └── utils/
        ├── logger.ts          # Banner de Barhel, formato con colores y spinners
        └── session.ts         # Rutas de sesiones en ~/.dev-agent-sessions/
```
