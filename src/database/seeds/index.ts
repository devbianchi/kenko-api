import { sql as limpeza } from './000-limpeza';
import { sql as clinica } from './001-clinica';
import { sql as profissionais } from './002-profissionais';
import { sql as horarios } from './003-horarios';
import { sql as conversas } from './004-conversas';

export interface SeedScript {
  name: string;
  sql: string;
}

/** Scripts da demonstração, na ordem de execução. */
export const SEED_SCRIPTS: readonly SeedScript[] = [
  { name: '000-limpeza.ts', sql: limpeza },
  { name: '001-clinica.ts', sql: clinica },
  { name: '002-profissionais.ts', sql: profissionais },
  { name: '003-horarios.ts', sql: horarios },
  { name: '004-conversas.ts', sql: conversas },
];
