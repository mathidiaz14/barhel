# 🤖 Barhel

> **Asistente de codificación conversacional y autónomo multi-modelo para la terminal** (estilo Claude Code / OpenCode). Permite programar directamente en cualquier carpeta, orquestando y delegando tareas en paralelo a través de las interfaces web de **Claude**, **DeepSeek**, **ChatGPT**, **Gemini**, **Qwen**, **Mistral** y **Perplexity** mediante **Playwright**, **sin necesidad de APIs de pago**.

```text
    ____             __          __     │  Session   : Refactorización API Auth (#4f91a82c)
   / __ )____ ______/ /_  ___   / /     │  Workspace : mi-proyecto (C:\proyectos\mi-proyecto:main)
  / __  / __ `/ ___/ __ \/ _ \ / /      │  Leader    : DeepSeek Chat (V3 / R1) (Inactivo)
 / /_/ / /_/ / /  / / / /  __// /       │  Workers   : claude, chatgpt, gemini, qwen
/_____/\__,_/_/  /_/ /_/\___//_/        │  Mode      : autonomous (/auto to toggle)
Autonomous Multi-Model Coding Agent     │  Version   : Barhel 1.0.0
──────────────────────────────────────────────────────────────────────────────────────────────
Type / for command palette • /workers for analysis • /graph for AST • Tab to complete
──────────────────────────────────────────────────────────────────────────────────────────────
barhel ❯ 
```

---

## 🌟 Características Principales

- 💸 **100% Gratuito (Zero API Cost):** Utiliza sesiones web autenticadas y persistentes mediante navegadores Chromium automatizados.
- 👑 **Orquestación Multi-Modelo:** Un modelo **Líder** (ej. DeepSeek R1 o Claude) analiza el repositorio y delega subtareas en paralelo a **Workers secundarios** (ChatGPT, Gemini, Qwen, Mistral).
- 🧪 **Motor de Auto-Pruebas y Verificación Autónoma:** Sandbox aislado (`eval_code`) para ejecutar assertions y runner inteligente de tests (`auto_test`, `/test`) con mandato de verificación antes de finalizar.
- 🕸️ **CodeGraph AST en Memoria:** Indexación instantánea de clases, funciones, métodos y dependencias cruzadas (`Callers` & `Callees`) en milisegundos (`/graph`).
- 📥 **Sistema de Skills estilo Claude Code:** Instala habilidades y reglas de arquitectura directamente desde URLs de GitHub (`/skill install <url>`).
- 📊 **Supervisor de Agentes y Progreso en Tiempo Real:** Métrica de avance porcentual (`0-100%`) para el Líder y Workers (`/progress`).
- 🤖 **Daemon en Segundo Plano y Bot de Telegram:** Deja a Barhel trabajando como servicio y conversa con él o recibe notificaciones al terminar tus tareas desde Telegram (`/telegram`, `/daemon`).
- 📜 **Historial y Memoria Visual de Sesiones:** Tarjetas legibles por turno, recuperación automática de contexto y navegación de prompts con flechas `↑` y `↓`.
- 🔒 **Seguridad y Cifrado Militar:** Validación contra path traversal, políticas de comandos allowlist/denylist y cifrado de sesiones con **AES-256-GCM** (`BARHEL_SECRET`).

---

## ⚡ Instalación

### Opción A: Instalación Global (Recomendado)
```bash
sudo npm install -g github:mathidiaz14/barhel
```

> **Importante:** Barhel utiliza Playwright para controlar los navegadores. Asegúrate de instalar Chromium:
> ```bash
> npx playwright install chromium
> ```

### Opción B: Instalación Local para Desarrollo
```bash
git clone https://github.com/mathidiaz14/barhel.git
cd barhel
npm install
npm run browsers   # Instala el navegador Chromium
npm run build      # Compila TypeScript
npm link           # Enlaza el comando global barhel
```

---

## 🔑 Primer Paso: Autenticación (`barhel login`)

Inicia sesión una sola vez en las plataformas web que vayas a utilizar:

```bash
# Iniciar sesión en un proveedor específico:
barhel login claude
barhel login deepseek
barhel login chatgpt
barhel login gemini
barhel login qwen
barhel login mistral
barhel login perplexity

# O en todos los proveedores secuencialmente:
barhel login all
```

> **¿Cómo funciona?** Se abrirá una ventana de Chromium. Inicia sesión en la plataforma y pulsa **Enter** en tu terminal. Las cookies y el almacenamiento de sesión se guardarán de forma segura en `~/.dev-agent-sessions/`.

### Importar Sesiones Existentes (`barhel import-sessions`)

Si ya tienes sesión iniciada en Chrome o Edge, puedes importarlas automáticamente sin tener que loguearte de nuevo:

```bash
# Importar desde Chrome (default)
barhel import-sessions

# Importar desde Edge
barhel import-sessions --browser edge

# Sobreescribir sesiones existentes
barhel import-sessions --force
```

> **Importante:** Cierra el navegador antes de importar para evitar archivos bloqueados.

### Borrar Sesiones (`barhel clear-sessions`)

Para eliminar las sesiones guardadas y empezar de cero:

```bash
# Borrar sesiones de proveedores configurados
barhel clear-sessions

# Borrar un proveedor específico
barhel clear-sessions --provider gemini

# Borrar todas las sesiones
barhel clear-sessions --all
```

---

## ⚙️ Configuración de Modelos (`barhel config`)

Configura qué modelo actuará como Líder y qué Workers estarán disponibles para delegar:

```bash
barhel config
```

### 🌐 Proveedores Web Soportados:
| Proveedor | Rol Principal | Modelo / Versión |
| :--- | :--- | :--- |
| 👑/👥 **Claude** | Líder / Worker | Claude 3.5 Sonnet / Claude 3.7 |
| 👑/👥 **DeepSeek** | Líder / Worker | DeepSeek Chat V3 / DeepSeek R1 |
| 👑/👥 **ChatGPT** | Líder / Worker | GPT-4o / o1 / o3-mini |
| 👑/👥 **Gemini** | Líder / Worker | Gemini 2.0 Flash / Pro / Thinking |
| 👑/👥 **Qwen** | Líder / Worker | Qwen 2.5 Coder 32B |
| 👑/👥 **Mistral** | Líder / Worker | Codestral / Mistral Large |
| 👥 **Perplexity** | Worker | Sonar / Online Research |

---

## 🚀 Uso de Barhel

### 1. Iniciar la CLI Interactiva en tu Proyecto
Navega a cualquier repositorio o carpeta y ejecuta:

```bash
cd /ruta/a/mi-proyecto
barhel
```

Al abrirse, Barhel cargará automáticamente la última sesión del proyecto, mostrará el transcript de turnos previos en tarjetas legibles y te permitirá continuar la conversación.

### 2. Ejecución Directa de Instrucciones (Non-Interactive)
Para tareas rápidas sin entrar al chat interactivo:

```bash
# Modo seguro (solicita confirmación antes de modificar archivos o ejecutar comandos)
barhel "Inspecciona el proyecto y añade TypeScript con tsconfig.json"

# Modo 100% Autónomo (-a)
barhel -a "Crea una suite de pruebas unitarias con Vitest y ejecútalas"

# Modo PLAN ONLY (--plan): simula los pasos sin aplicar cambios en disco
barhel --plan "Refactoriza el módulo de autenticación"

# Notificación sonora al terminar
barhel --notify -a "Ejecuta los tests del proyecto y soluciona cualquier error"
```

---

## 🧰 Módulos y Capacidades Avanzadas

### 🧪 1. Motor de Auto-Pruebas y Verificación (`eval_code` / `/test`)
Barhel tiene la regla estricta de **probar lo que programa antes de dar la tarea por finalizada**:
- **Sandbox Aislado (`eval_code`):** El modelo escribe snippets temporales en TypeScript/Node/Python/PHP con assertions para validar sus funciones sin ensuciar tu repositorio.
- **Project Test Runner (`auto_test` / `/test`):** Detecta automáticamente frameworks como Vitest, Jest, PyTest, PHPUnit o Node Test Runner y ejecuta las pruebas de los archivos modificados.
- **Comando manual:** Escribe `/test` en el chat para correr la suite en cualquier momento.

### 🕸️ 2. CodeGraph AST en Memoria (`/graph`)
Analiza el árbol sintáctico (AST) del proyecto para consultar al instante la jerarquía de clases, métodos, funciones y relaciones de llamadas (`Callers` & `Callees`) sin gastar tokens leyendo archivos completos:
```bash
# Desde la terminal:
barhel graph
barhel graph Orchestrator

# Dentro del chat interactivo:
/graph
/graph AuthService
```

### 📥 3. Sistema de Skills estilo Claude Code (`/skill`)
Descarga e instala metodologías o guías de arquitectura desde cualquier URL o repositorio:
```text
/skill install https://raw.githubusercontent.com/usuario/mi-repo/main/SKILL.md
/skills
```

### 🤖 4. Background Daemon y Telegram Bot (`/daemon` / `/telegram`)
Permite dejar al agente corriendo en segundo plano 24/7 y controlarlo desde Telegram:
- **Iniciar daemon:** `barhel daemon start` o `/daemon start`.
- **Conectar Telegram:** `barhel telegram <token>` o `/telegram <token>`.
- **Notificaciones automáticas:** Te envía un mensaje a Telegram cuando termina una tarea larga con el resumen de cambios.

### 📊 5. Supervisión de Agentes y Avance en Vivo (`/progress`)
Supervisa en tiempo real el porcentaje (`0-100%`) y estado de las subtareas (`todos`) asignadas tanto al Líder como a los Workers secundarios:
```text
/progress
/supervise
```

---

## ⌨️ Tabla de Comandos Slash en el Chat

| Comando | Descripción |
| :--- | :--- |
| `/help` | Muestra la ayuda y lista de comandos |
| `/test [filtro]` | 🧪 **Auto-Pruebas:** Ejecuta el runner de pruebas del proyecto o un archivo de test |
| `/graph [simbolo]` | 🕸️ **CodeGraph AST:** Muestra el mapa de arquitectura o inspecciona funciones y quién las llama (alias: `/codegraph`) |
| `/skills` | ⚡ **Lista de Skills:** Muestra las habilidades y metodologías instaladas |
| `/skill install <url>` | 📥 **Instalar Skill:** Descarga e instala una skill desde GitHub o URL directa |
| `/progress` o `/supervise` | 📊 **Supervisión:** Muestra el porcentaje de avance (%) en vivo del Líder y Workers |
| `/telegram [token]` | 🤖 **Telegram Bot:** Configura o conecta el bot de Telegram |
| `/daemon [start\|stop\|status]`| ⚙️ **Modo Segundo Plano:** Controla el proceso de Barhel ejecutándose como daemon |
| `/workers` o `/analysis` | 🔍 **Inspector de Workers:** Abre el modal interactivo con los análisis de los modelos secundarios |
| `/think` o `/thinking` | 💭 **Modo de Razonamiento:** Alterna entre razonamiento extendido o resumen compacto |
| `/resume` o `/history` | Abre el selector visual para reanudar una sesión anterior |
| `/new [título]` | Inicia una sesión limpia con nuevo chat en el navegador |
| `/title <texto>` | Renombra el título de la sesión actual |
| `/sessions` o `/list` | Lista las sesiones guardadas en disco |
| `/config` o `/models` | Configura el modelo Líder y Workers en caliente |
| `/leader <id>` | Cambia el modelo Líder rápidamente (deepseek, claude, chatgpt, gemini...) |
| `/auto` | Alterna entre **Modo Autónomo** (sin confirmación) y **Modo Seguro** (`[y/N]`) |
| `/plan` | Alterna **Modo PLAN ONLY** (simula acciones sin modificar archivos) |
| `/commit [mensaje]` | Realiza `git add -A` + `git commit` automático |
| `/review` | Muestra `git status` y el `git diff` coloreado del proyecto |
| `/explain <tema>` | Pide al Líder que explique un archivo o símbolo sin modificar nada |
| `/fix [error]` | Ejecuta `check` y repara automáticamente errores de compilación y linters |
| `/summarize` | Genera y almacena el resumen de memoria a largo plazo |
| `/export [json\|md]` | Exporta la sesión a Markdown o JSON |
| `/backup [archivo]` | Exporta todas las credenciales web e historial a un `.tar.gz` |
| `/restore <archivo>` | Importa credenciales e historial desde un archivo `.tar.gz` |
| `/status` | Comprueba el estado de las credenciales de cada proveedor |
| `/login [proveedor]` | Inicia sesión en un proveedor web sin salir del chat |
| `/clear` | Limpia la pantalla de la terminal |
| `/exit` o `/quit` | Guarda y cierra la sesión de Barhel |

---

## 🔒 Seguridad y Configuración Avanzada

### Cifrado Militar de Sesiones (`BARHEL_SECRET`)
Puedes proteger todas tus sesiones guardadas activando el cifrado **AES-256-GCM**:
```bash
# Linux/macOS
export BARHEL_SECRET="tu-clave-super-secreta"

# Windows (PowerShell)
$env:BARHEL_SECRET = "tu-clave-super-secreta"
```

### Configuración en `~/.dev-agent-sessions/config.json`:
```json
{
  "leader": "deepseek",
  "workers": ["claude", "chatgpt", "gemini", "qwen"],
  "autonomousDefault": false,
  "maxIterations": 25,
  "commandPolicies": {
    "deny": ["rm\\s+-(?:rf|r\\s+f|f\\s+r|fr)\\b", "git\\s+push\\s+--force"],
    "allow": ["^npm test$", "^git status$"]
  },
  "fallbackOrder": ["chatgpt", "gemini"],
  "autoSummarize": true,
  "autoCommit": false
}
```

---

## 📁 Arquitectura del Proyecto

```text
barhel/
├── bin/
│   └── run.ts                 # CLI principal Commander (barhel, graph, skill, daemon, telegram)
├── src/
│   ├── cli/
│   │   ├── repl.ts            # Bucle interactivo REPL, autocompletado y slash commands
│   │   ├── tui.ts             # Interfaz visual de terminal, banner dividido y tarjetas de turnos
│   │   ├── DualPane.ts        # Dashboard dividido de métricas, estado y git branch
│   │   └── commandPalette.ts  # Paleta interactiva de comandos al escribir '/'
│   ├── codegraph/
│   │   └── CodeGraphEngine.ts # Motor AST TypeScript/JavaScript y resolución de Callers/Callees
│   ├── daemon/
│   │   ├── DaemonManager.ts   # Gestor de procesos en segundo plano con PID
│   │   └── TelegramBot.ts     # Bridge con Telegram Bot API vía long-polling nativo
│   ├── testing/
│   │   └── TestSandbox.ts     # Sandbox aislado (eval_code) y runner de tests del proyecto
│   ├── skills/
│   │   └── SkillManager.ts    # Gestor de Skills, parsing YAML frontmatter e inyección de prompts
│   ├── drivers/
│   │   ├── BaseDriver.ts      # Contexto persistente de Chromium, evasión y selectores
│   │   ├── DeepSeekDriver.ts  # Driver web para DeepSeek Chat (Líder)
│   │   ├── ClaudeDriver.ts    # Driver web para Claude (Líder/Worker)
│   │   ├── ChatGPTDriver.ts   # Driver web para ChatGPT (Worker)
│   │   ├── GeminiDriver.ts    # Driver web para Gemini (Worker)
│   │   ├── QwenDriver.ts      # Driver web para Qwen Chat (Worker)
│   │   ├── MistralDriver.ts   # Driver web para Mistral Le Chat (Worker)
│   │   └── PerplexityDriver.ts# Driver web para Perplexity AI (Worker)
│   ├── engine/
│   │   ├── Orchestrator.ts    # Bucle ReAct multi-agente, memoria y auto-delegación
│   │   ├── ToolEngine.ts      # Ejecución de herramientas seguras, contención de rutas y diffs
│   │   ├── ResponseParser.ts  # Parser JSON resiliente con vista previa de razonamiento en vivo
│   │   └── ProgressSupervisor.ts # Métrica de porcentaje de avance y supervisión
│   └── utils/
│       ├── history.ts         # Persistencia de sesiones y formateo de transcripciones
│       ├── crypto.ts          # Cifrado/descifrado AES-256-GCM
│       ├── config.ts          # Gestor de configuración persistente
│       └── exec.ts            # Ejecutor seguro de subprocesos
└── test/                      # Suite completa de 38 pruebas unitarias
```

---

## 🧪 Pruebas Unitarias

Para ejecutar la suite completa de pruebas:
```bash
npm test
```

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta `LICENSE` para más detalles.
