import fs from 'node:fs';
import path from 'node:path';
import { getSessionBasePath } from '../utils/session.js';
import { logger } from '../utils/logger.js';

export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  homepage?: string;
  installedAt: string;
}

export interface SkillDefinition {
  meta: SkillMeta;
  instructions: string;
  filePath: string;
}

export class SkillManager {
  private static getSkillsDir(): string {
    const base = getSessionBasePath();
    const skillsDir = path.join(base, 'skills');
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
    return skillsDir;
  }

  /**
   * Parsea un archivo o texto de SKILL.md extrayendo el YAML Frontmatter y las instrucciones
   */
  public static parseSkillMarkdown(rawContent: string, defaultName = 'custom-skill'): SkillDefinition {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = rawContent.match(frontmatterRegex);

    let meta: SkillMeta = {
      name: defaultName,
      description: 'Habilidad personalizada para Barhel',
      installedAt: new Date().toISOString(),
    };

    let instructions = rawContent.trim();

    if (match) {
      const yamlBlock = match[1];
      instructions = match[2].trim();

      // Parseo básico de YAML sin dependencias pesadas
      const lines = yamlBlock.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');

          if (key === 'name' && val) meta.name = val.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          if (key === 'description' && val) meta.description = val;
          if (key === 'version' && val) meta.version = val;
          if (key === 'author' && val) meta.author = val;
          if (key === 'homepage' && val) meta.homepage = val;
          if (key === 'tags' && val) {
            meta.tags = val.replace(/[\[\]]/g, '').split(',').map((t) => t.trim()).filter(Boolean);
          }
        }
      }
    }

    return {
      meta,
      instructions,
      filePath: '',
    };
  }

  /**
   * Instala una Skill descargándola directamente desde una URL (GitHub, Gist, web)
   */
  public static async installFromUrl(url: string, customName?: string): Promise<SkillDefinition> {
    let fetchUrl = url.trim();

    // Normalizar enlaces de GitHub blob a raw
    if (fetchUrl.includes('github.com') && fetchUrl.includes('/blob/')) {
      fetchUrl = fetchUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }

    // Si la URL apunta a un repo/carpeta sin SKILL.md, añadirlo
    if (!fetchUrl.endsWith('.md') && !fetchUrl.endsWith('.txt')) {
      fetchUrl = fetchUrl.replace(/\/$/, '') + '/SKILL.md';
    }

    logger.info(`Descargando skill desde: ${fetchUrl}...`);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al descargar la skill desde: ${fetchUrl}`);
    }

    const content = await response.text();
    if (!content || content.trim().length === 0) {
      throw new Error('El archivo descargado está vacío.');
    }

    const fallbackName = customName || path.basename(url).replace(/\.git|\.md$/i, '') || 'skill';
    const skillDef = this.parseSkillMarkdown(content, fallbackName);
    if (customName) {
      skillDef.meta.name = customName;
    }

    const targetDir = path.join(this.getSkillsDir(), skillDef.meta.name);
    fs.mkdirSync(targetDir, { recursive: true });

    const targetFile = path.join(targetDir, 'SKILL.md');
    fs.writeFileSync(targetFile, content, 'utf-8');

    skillDef.filePath = targetFile;
    logger.success(`Skill "${skillDef.meta.name}" instalada con éxito en ${targetDir}`);
    return skillDef;
  }

  /**
   * Lista todas las skills instaladas localmente
   */
  public static listSkills(): SkillDefinition[] {
    const skillsDir = this.getSkillsDir();
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: SkillDefinition[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          try {
            const raw = fs.readFileSync(skillPath, 'utf-8');
            const def = this.parseSkillMarkdown(raw, entry.name);
            def.filePath = skillPath;
            skills.push(def);
          } catch {
            // Ignorar
          }
        }
      }
    }

    return skills;
  }

  /**
   * Carga una skill específica por nombre
   */
  public static getSkill(name: string): SkillDefinition | null {
    const targetDir = path.join(this.getSkillsDir(), name.toLowerCase());
    const skillPath = path.join(targetDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return null;
    }
    const raw = fs.readFileSync(skillPath, 'utf-8');
    const def = this.parseSkillMarkdown(raw, name);
    def.filePath = skillPath;
    return def;
  }

  /**
   * Elimina una skill instalada
   */
  public static uninstallSkill(name: string): boolean {
    const targetDir = path.join(this.getSkillsDir(), name.toLowerCase());
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  /**
   * Genera el bloque de documentación de Skills disponibles para inyectar en el System Prompt
   */
  public static buildSkillsSystemPrompt(): string {
    const skills = this.listSkills();
    if (skills.length === 0) return '';

    const lines: string[] = [];
    lines.push('\n[AVAILABLE INSTALLED SKILLS (Claude Code Style)]');
    lines.push('You have the following domain-specific skills installed and available:');
    for (const s of skills) {
      lines.push(`- skill: "${s.meta.name}": ${s.meta.description}`);
    }
    lines.push('If a task relates to one of these skills, you can follow its specialized methodology or invoke `use_skill`.');

    return lines.join('\n');
  }
}
