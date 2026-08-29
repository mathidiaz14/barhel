import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillManager } from '../src/skills/SkillManager.js';

test('SkillManager: parsea correctamente un archivo SKILL.md con YAML Frontmatter', () => {
  const rawSkill = `---
name: nestjs-architect
description: Buenas prácticas y arquitectura limpia para NestJS y TypeORM
version: 1.0.0
author: Barhel
tags: [nestjs, typescript, typeorm]
---

# Instrucciones de NestJS Architect

Al crear módulos, genera siempre el Controller, Service, Module y DTOs con class-validator.
`;

  const parsed = SkillManager.parseSkillMarkdown(rawSkill);

  assert.equal(parsed.meta.name, 'nestjs-architect');
  assert.ok(parsed.meta.description.includes('Buenas prácticas y arquitectura limpia'));
  assert.equal(parsed.meta.version, '1.0.0');
  assert.ok(parsed.meta.tags?.includes('nestjs'));
  assert.ok(parsed.instructions.includes('# Instrucciones de NestJS Architect'));
});

test('SkillManager: genera el System Prompt con las skills disponibles', () => {
  const prompt = SkillManager.buildSkillsSystemPrompt();
  assert.equal(typeof prompt, 'string');
});
