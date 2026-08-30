import pc from 'picocolors';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { DriverHealthReport } from '../drivers/BaseDriver.js';
import { logger } from '../utils/logger.js';

export interface DoctorOptions {
  provider?: string;
  ping?: boolean;
  visible?: boolean;
}

/**
 * Ejecuta el diagnóstico exhaustivo de salud, autenticación y selectores de UI
 */
export async function runDoctorDiagnostic(options: DoctorOptions = {}): Promise<boolean> {
  console.log();
  console.log(pc.bold(pc.cyan('┌─ 🩺 DIAGNÓSTICO PROFUNDO DE SALUD DE BARHEL ──────────────────────────────────')));
  console.log(pc.dim('│  Verificando conexión web, autenticación de sesión, Cloudflare y selectores UI...'));
  console.log(pc.bold(pc.cyan('└───────────────────────────────────────────────────────────────────────────────')));
  console.log();

  const providers = options.provider
    ? DriverFactory.getMeta(options.provider)
      ? [DriverFactory.getMeta(options.provider)!]
      : (() => {
          logger.error(`Proveedor desconocido: "${options.provider}"`);
          return [];
        })()
    : DriverFactory.getAllProviders();

  if (providers.length === 0) return false;

  let allHealthy = true;
  const reports: DriverHealthReport[] = [];

  for (const meta of providers) {
    logger.startSpinner(`Inspeccionando [${meta.name}]...`);
    const driver = meta.createDriver();
    let report: DriverHealthReport;

    try {
      await driver.init(!options.visible);
      report = await driver.verifyHealth(options.ping ?? false);
      reports.push(report);
      logger.stopSpinner();
    } catch (err) {
      logger.stopSpinner();
      report = {
        providerId: meta.id,
        displayName: meta.name,
        url: meta.url,
        authenticated: false,
        authReason: err instanceof Error ? err.message : String(err),
        cloudflareBlocked: false,
        inputSelectorFound: false,
        sendButtonFound: false,
        responseContainerFound: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      reports.push(report);
    } finally {
      await driver.close();
    }

    const isOk = report.authenticated && report.inputSelectorFound && !report.cloudflareBlocked;
    if (!isOk) allHealthy = false;

    // Renderizar tarjeta individual para este proveedor
    const cardBorder = isOk ? pc.green('┌─') : pc.red('┌─');
    const bottomBorder = isOk ? pc.green('└─') : pc.red('└─');
    const lineBorder = isOk ? pc.green('│') : pc.red('│');
    const badge = isOk ? pc.bgGreen(pc.black(' LISTO PARA USAR ')) : pc.bgRed(pc.white(' REQUIERE ATENCIÓN '));

    console.log(`${cardBorder} ${pc.bold(report.displayName)} ${pc.dim(`[${report.providerId}]`)} ${badge}`);
    console.log(`${lineBorder}  ${pc.dim('URL Base     :')} ${pc.white(report.url)}`);

    // Estado de Autenticación
    if (report.authenticated) {
      console.log(`${lineBorder}  ${pc.dim('Sesión Web   :')} ${pc.green('✔ Autenticado y Conectado')}`);
    } else {
      console.log(`${lineBorder}  ${pc.dim('Sesión Web   :')} ${pc.red('✖ No autenticado')} ${pc.yellow(`(${report.authReason || 'Sin sesión activa'})`)}`);
    }

    // Cloudflare / Bot Protection
    if (report.cloudflareBlocked) {
      console.log(`${lineBorder}  ${pc.dim('Anti-Bot     :')} ${pc.red('✖ Bloqueado por Cloudflare CAPTCHA')}`);
    } else {
      console.log(`${lineBorder}  ${pc.dim('Anti-Bot     :')} ${pc.green('✔ Despejado')}`);
    }

    // Selectores UI
    const inputBadge = report.inputSelectorFound ? pc.green(`✔ Operativo (${report.inputSelector})`) : pc.red('✖ No encontrado');
    console.log(`${lineBorder}  ${pc.dim('Campo Texto  :')} ${inputBadge}`);

    const sendBadge = report.sendButtonFound ? pc.green(`✔ Operativo (${report.sendButtonSelector})`) : pc.yellow('⚠ Usando tecla Enter');
    console.log(`${lineBorder}  ${pc.dim('Botón Enviar :')} ${sendBadge}`);

    // Latencia
    if (report.latencyMs > 0) {
      const latColor = report.latencyMs < 1500 ? pc.green : (report.latencyMs < 4000 ? pc.yellow : pc.red);
      console.log(`${lineBorder}  ${pc.dim('Latencia Red :')} ${latColor(`${report.latencyMs}ms`)}`);
    }

    // Test Ping en vivo
    if (options.ping) {
      if (report.pingSuccess) {
        console.log(`${lineBorder}  ${pc.dim('Test Ping    :')} ${pc.green(`✔ Respuesta recibida en ${report.pingDurationMs}ms: "${report.pingResponse}"`)}`);
      } else if (report.authenticated) {
        console.log(`${lineBorder}  ${pc.dim('Test Ping    :')} ${pc.red(`✖ Falló el ping (${report.error || 'sin respuesta'})`)}`);
      }
    }

    // Consejo de solución si no está autenticado
    if (!report.authenticated) {
      console.log(`${lineBorder}  ${pc.cyan('💡 Solución   :')} ${pc.bold(pc.yellow(`barhel login ${report.providerId}`))}`);
    }

    console.log(`${bottomBorder}${'─'.repeat(70)}`);
    console.log();
  }

  // Resumen final
  const authenticatedCount = reports.filter((r) => r.authenticated && r.inputSelectorFound).length;
  console.log(
    pc.bold(
      `📊 Resumen: ${pc.green(`${authenticatedCount}/${reports.length}`)} modelos operativos.`
    )
  );

  if (!allHealthy) {
    console.log(pc.yellow(`\n💡 Para iniciar sesión en cualquier modelo pendiente, ejecuta: ${pc.cyan('barhel login <proveedor>')}`));
    console.log(pc.dim(`   Ejemplos: barhel login gemini | barhel login chatgpt | barhel login claude\n`));
  } else {
    console.log(pc.green(`\n✔ Todos los modelos comprobados están listos para trabajar como Líder o Workers.\n`));
  }

  return allHealthy;
}
