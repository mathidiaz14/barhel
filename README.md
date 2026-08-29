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
npm install -g github:mathidiaz14/barhel
```

> **Nota:** Barhel usa **Playwright** para controlar el navegador. Asegúrate de tener el navegador Chromium instalado:
> ```bash
> npx playwright install chromium
> ```

### Opción B: Instalación local para desarrollo
```bash
git clone <url-del-repo>
cd barhel
npm install
npm run browsers   # instala el Chromium de Playwright
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

### Configuración avanzada (`~/.dev-agent-sessions/config.json`)
Además de `leader`/`workers`, puedes editar a mano:

| Campo | Descripción |
| :--- | :--- |
| `autonomousDefault` | Arrancar en modo autónomo (`true`/`false`) |
| `maxIterations` | Límite de pasos ReAct por instrucción |
| `commandPolicies.deny` | Regex de comandos **siempre bloqueados** (ej. `["rm -rf", "mkfs"]`) |
| `commandPolicies.allow` | Regex de comandos que **no piden confirmación** (ej. `["^npm test$"]`) |
| `fallbackOrder` | Proveedores de respaldo del Líder (ej. `["chatgpt", "gemini"]`) |
| `autoSummarize` | Generar resumen de memoria al cerrar (default `true`) |
| `autoCommit` | Commit automático al terminar en modo autónomo (default `false`) |

> 🛡️ **Denylist por defecto:** comandos como `rm -rf`, `mkfs`, `> /dev/sd*`, `curl|sh`, `shutdown`, `git push --force` están bloqueados incluso en modo autónomo.

> 👥 **Fallback de líder:** si el proveedor primario falla 2 veces seguidas, Barhel cambia automáticamente a `fallbackOrder` (nuevo hilo web para ese proveedor).

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

### Exportar una sesión:
```bash
barhel export <sessionId>                # Markdown (default)
barhel export <sessionId> --format json  # JSON crudo
barhel export <sessionId> --out ./docs/  # carpeta de salida
```

### Copia de seguridad y Migración Completa (backup/restore):
Si deseas migrar todas tus sesiones de autenticación (cookies) e historiales de chat completos a otra computadora, puedes exportar e importar el directorio de sesiones completo:
```bash
# Exportar sesiones e historial a un archivo comprimido (.tar.gz):
barhel backup
# (O especificando un nombre personalizado)
barhel backup mi-copia.tar.gz

# Restaurar e importar en la nueva computadora:
barhel restore barhel-backup-2026-08-29.tar.gz
```

### Memoría a largo plazo
Al cerrar (`finish` o `Ctrl+C`), Barhel resume automáticamente los turnos nuevos con el Líder y guarda el resumen en la sesión. Al reanudar, ese resumen se reinyecta como contexto (configurable con `autoSummarize` en `config.json`). Puedes generarlo manualmente con `/summarize`.

### Diagnóstico de proveedores (`barhel doctor`)
Verifica que los selectores de UI de cada proveedor sigan presentes (detecta cambios de interfaz que rompan los drivers):
```bash
barhel doctor
barhel doctor --provider deepseek
```

### Cifrar las sesiones guardadas (`BARHEL_SECRET`)
Define la variable de entorno `BARHEL_SECRET` para guardar las sesiones del historial cifradas con **AES-256-GCM** (archivos `.json.enc`). Sin la variable, se guardan en claro como antes.
```bash
# Windows (PowerShell)
$env:BARHEL_SECRET = "mi-clave-secreta"

# Linux/macOS
export BARHEL_SECRET="mi-clave-secreta"
```
> ⚠️ Si rotas `BARHEL_SECRET`, las sesiones `.json.enc` existentes dejarán de poder leerse. `/status` avisa si hay sesiones cifradas sin clave.

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
| `/codegraph [simbolo]` | 🕸️ **CodeGraph en Memoria:** Muestra el grafo de arquitectura AST, funciones, clases y relaciones de llamadas en milisegundos |
| `/skills` | ⚡ **Lista de Skills:** Muestra las habilidades instaladas al estilo Claude Code |
| `/skill install <url>` | 📥 **Instalar Skill:** Descarga e instala automáticamente una skill desde GitHub/URL |
| `/progress` o `/supervise` | 📊 **Supervisión de Agentes:** Muestra el porcentaje de avance (%) en tiempo real del Líder y Workers |
| `/telegram [token]` | 🤖 **Telegram Bot Bridge:** Conecta Barhel con tu bot de Telegram para control y notificaciones |
| `/daemon [start\|stop\|status]` | ⚙️ **Modo Segundo Plano:** Controla el proceso de Barhel ejecutándose como daemon |
| `/workers` o `/analysis` | 🔍 **Inspector de Workers:** Abre el modal interactivo para leer el análisis y razonamiento completo de los agentes secundarios |
| `/think` o `/thinking` | 💭 **Modo de Razonamiento:** Alterna entre el bloque visual completo estilo Claude Code o una sola línea compacta |
| `/resume` o `/history` | Abre el selector visual para saltar a una sesión anterior con todo su contexto |
| `/new [título]` | Inicia una nueva sesión limpia y abre un chat nuevo en el LLM web |
| `/title <texto>` | Renombra el título descriptivo de la sesión actual |
| `/sessions` o `/list` | Muestra el listado de sesiones recientes guardadas en el disco |
| `/config` o `/models` | Cambia interactivamente el modelo Líder y Workers al vuelo |
| `/leader <id>` | Cambia el modelo Líder manualmente (deepseek, claude, chatgpt, gemini, ...) |
| `/auto` | Alterna entre **Modo Autónomo** (sin confirmaciones) y **Modo Seguro** (`[y/N]`) |
| `/plan` | Alterna **Modo PLAN ONLY**: el lider simula escrituras/comandos sin aplicarlos |
| `/commit [mensaje]` | Hace `git add -A` + `git commit` de los cambios del workspace |
| `/review` | Muestra `git status` + `git diff` del workspace |
| `/explain <tema>` | Pide al Líder que explique un símbolo/archivo sin modificar nada |
| `/fix [error]` | Pide al Líder que ejecute `check` y corrija los errores de tipo/lint |
| `/summarize` | Genera el resumen de memoria de la sesión (memoria a largo plazo) |
| `/export [json|md]` | Exporta la sesión actual a Markdown o JSON |
| `/backup [archivo]` | Exporta todas las sesiones de autenticación e historial a un archivo `.tar.gz` |
| `/restore <archivo>` | Importa sesiones de autenticación e historial desde un archivo `.tar.gz` |
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

# Modo PLAN ONLY: simula los cambios y termina con el plan (sin modificar archivos)
barhel --plan "Refactoriza el módulo de autenticación"

# Notificación sonora al terminar
barhel --notify -a "Ejecuta los tests del proyecto"

# Opciones adicionales
barhel --headless -a -w "./otro-proyecto" "Refactoriza el módulo de autenticación"
```

---

## 📁 Estructura del Código Fuente

```text
barhel/
├── package.json               # Dependencias (Playwright, Commander, Picocolors, Ora, Inquirer)
├── tsconfig.json              # Configuración TypeScript ESM / NodeNext
├── bin/
│   └── run.ts                 # Entrypoint del ejecutable 'barhel' (CLI Commander)
├── src/
│   ├── cli/
│   │   ├── repl.ts            # Módulo de Chat Interactivo REPL y slash commands
│   │   └── tui.ts             # Renderizado estilo OpenCode/Claude Code (banner, spinner, inspector)
│   ├── types/
│   │   ├── actions.ts         # Tipos e interfaces ReAct y herramientas
│   │   └── providers.ts       # Enum de proveedores y configuración de selectores
│   ├── drivers/
│   │   ├── BaseDriver.ts      # Contexto persistente, ciclo de vida y anti-detección
│   │   ├── DriverFactory.ts   # Registro de proveedores disponibles
│   │   ├── DeepSeekDriver.ts  # Driver web para DeepSeek Chat (Líder)
│   │   ├── ChatGPTDriver.ts   # Driver web para ChatGPT (Worker)
│   │   ├── GeminiDriver.ts    # Driver web para Gemini (Worker)
│   │   ├── ClaudeDriver.ts    # Driver web para Claude
│   │   ├── QwenDriver.ts      # Driver web para Qwen Chat
│   │   ├── MistralDriver.ts   # Driver web para Mistral Le Chat
│   │   └── PerplexityDriver.ts# Driver web para Perplexity AI
│   ├── engine/
│   │   ├── ToolEngine.ts      # Herramientas FS/terminal (read/write/list/grep/glob/check), plan-only, políticas de comandos, diff preview
│   │   ├── ResponseParser.ts  # Extractor y validador resiliente de JSON (incluye delegate_batch)
│   │   └── Orchestrator.ts    # Loop ReAct multi-turno, worker paralelos, fallback de líder, memoria a largo plazo, auto-commit
│   └── utils/
│       ├── logger.ts          # Logs con colores y delegación de spinner
│       ├── spinner.ts         # Spinner único compartido (evita spinners superpuestos)
│       ├── config.ts          # Configuración persistente de modelos + políticas/fallback/automatización
│       ├── history.ts         # Sesiones y turnos en ~/.dev-agent-sessions/history (cifrado AES-256-GCM opcional)
│       ├── session.ts         # Rutas de perfiles de navegador por proveedor
│       ├── crypto.ts          # Cifrado/descifrado AES-256-GCM con BARHEL_SECRET
│       ├── git.ts             # Helpers git (status/diff/commit) con exec compartido
│       ├── exec.ts            # Ejecutor de comandos promisificado (STDOUT/STDERR combinados)
│       ├── version.ts         # Lectura de versión centralizada desde package.json
│       └── workerStore.ts     # Analisis en memoria de los workers (inspector /workers)
└── test/
    ├── response-parser.test.ts # Tests de parsing/validación JSON (incluye grep/glob/check/delegate_batch)
    ├── toolengine.test.ts      # Tests de contención de rutas, grep/glob, plan-only y políticas
    ├── crypto.test.ts          # Tests de cifrado/descifrado AES-256-GCM
    └── history.test.ts         # Tests de sesiones, cifrado en disco y export Markdown
```

> **Nota:** Las herramientas del `ToolEngine` verifican que toda ruta (leer/escribir/explorar) permanezca dentro del `--workdir` actual, incluyendo defensa contra `..` y symlinks, incluso en modo autónomo.
