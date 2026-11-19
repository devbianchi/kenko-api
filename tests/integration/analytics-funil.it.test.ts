import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

const NOW = '2026-11-10T15:15:00Z'; // terça, 12:15 em São Paulo

interface ConversationSpec {
  inicio: string;
  ultimaInteracao: string;
  passo: string;
  encerradaEm?: string;
  etapaDeSaida?: string;
}

describe('funil e términos de Analytics (fase 8b)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let contactNumber = 0;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await resetClinica(pool);
    await clinicaBasica(pool);
    app = buildApp({ pool, clock: fixedClock(NOW), corsOrigins: [] });
  }, 180_000);

  beforeEach(async () => {
    contactNumber = 0;
    await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  async function conversation(spec: ConversationSpec): Promise<number> {
    const closing = spec.encerradaEm !== undefined;
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao,
                             encerrada_em, encerramento_motivo, encerramento_etapa)
       SELECT id_passo, $2, $3, $4, $5, $6, $7 FROM passo_roteiro WHERE codigo_passo = $1
       RETURNING id_conversa AS id`,
      [
        closing ? 'closed' : spec.passo,
        `funil_${++contactNumber}`,
        spec.inicio,
        spec.ultimaInteracao,
        spec.encerradaEm ?? null,
        closing ? 'exited' : null,
        spec.etapaDeSaida ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async function events(conversationId: number, tipos: Array<[string, string]>): Promise<void> {
    for (const [tipo, instante] of tipos) {
      await pool.query(
        `INSERT INTO evento_conversa (id_conversa, tipo, instante) VALUES ($1, $2, $3)`,
        [conversationId, tipo, instante],
      );
    }
  }

  it('conta o funil pela coorte de início e mede saídas e abandonos por etapa', async () => {
    // A: fez tudo e confirmou; ficou no menu depois.
    const a = await conversation({
      inicio: '2026-11-02T09:00:00-03:00',
      ultimaInteracao: '2026-11-02T09:05:00-03:00',
      passo: 'menu',
    });
    await events(a, [
      ['STARTED_SCHEDULING', '2026-11-02T09:00:30-03:00'],
      ['ANSWERED_SPECIALTY', '2026-11-02T09:01:00-03:00'],
      ['SLOT_SEARCH_RESULT', '2026-11-02T09:02:00-03:00'],
      ['SELECTED_SLOT', '2026-11-02T09:03:00-03:00'],
      ['APPOINTMENT_CONFIRMED', '2026-11-02T09:04:00-03:00'],
    ]);

    // B: saiu na escolha de horário.
    const b = await conversation({
      inicio: '2026-11-03T10:00:00-03:00',
      ultimaInteracao: '2026-11-03T10:02:00-03:00',
      passo: 'slot_selection',
      encerradaEm: '2026-11-03T10:10:00-03:00',
      etapaDeSaida: 'slot_selection',
    });
    await events(b, [
      ['STARTED_SCHEDULING', '2026-11-03T10:00:20-03:00'],
      ['ANSWERED_SPECIALTY', '2026-11-03T10:01:00-03:00'],
      ['SLOT_SEARCH_RESULT', '2026-11-03T10:02:00-03:00'],
    ]);

    // C: parou nos dados do paciente há mais de uma hora; abandonada.
    const c = await conversation({
      inicio: '2026-11-04T11:00:00-03:00',
      ultimaInteracao: '2026-11-04T11:10:00-03:00',
      passo: 'patient_data',
    });
    await events(c, [
      ['STARTED_SCHEDULING', '2026-11-04T11:00:30-03:00'],
      ['ANSWERED_SPECIALTY', '2026-11-04T11:01:00-03:00'],
    ]);

    // D: triagem, ativa há 15 minutos; não entra nos términos.
    const d = await conversation({
      inicio: '2026-11-05T10:00:00-03:00',
      ultimaInteracao: '2026-11-10T12:00:00-03:00',
      passo: 'specialty',
    });
    await events(d, [['STARTED_SCHEDULING', '2026-11-05T10:00:10-03:00']]);

    // E: abandonada no menu; o menu fica fora das barras de término.
    const e = await conversation({
      inicio: '2026-11-06T10:00:00-03:00',
      ultimaInteracao: '2026-11-06T10:05:00-03:00',
      passo: 'menu',
    });
    await events(e, [['STARTED_SCHEDULING', '2026-11-06T10:00:10-03:00']]);

    // F: saiu no menu; também fora das barras.
    const f = await conversation({
      inicio: '2026-11-06T15:00:00-03:00',
      ultimaInteracao: '2026-11-06T15:02:00-03:00',
      passo: 'menu',
      encerradaEm: '2026-11-06T15:02:00-03:00',
      etapaDeSaida: 'menu',
    });
    await events(f, [['STARTED_SCHEDULING', '2026-11-06T15:00:10-03:00']]);

    // G: exatamente uma hora de inatividade ainda é ativa.
    const g = await conversation({
      inicio: '2026-11-07T08:00:00-03:00',
      ultimaInteracao: '2026-11-10T11:15:00-03:00',
      passo: 'specialty',
    });
    await events(g, [['STARTED_SCHEDULING', '2026-11-07T08:00:10-03:00']]);

    // H: escolheu horário e saiu na confirmação.
    const h = await conversation({
      inicio: '2026-11-07T14:00:00-03:00',
      ultimaInteracao: '2026-11-07T14:05:00-03:00',
      passo: 'confirmation',
      encerradaEm: '2026-11-07T14:20:00-03:00',
      etapaDeSaida: 'confirmation',
    });
    await events(h, [
      ['STARTED_SCHEDULING', '2026-11-07T14:00:10-03:00'],
      ['ANSWERED_SPECIALTY', '2026-11-07T14:01:00-03:00'],
      ['SLOT_SEARCH_RESULT', '2026-11-07T14:02:00-03:00'],
      ['SELECTED_SLOT', '2026-11-07T14:05:00-03:00'],
    ]);

    // Outubro: iniciou em outubro e confirmou em novembro; conta no grupo de outubro.
    const outubro = await conversation({
      inicio: '2026-10-30T10:00:00-03:00',
      ultimaInteracao: '2026-11-01T00:05:00-03:00',
      passo: 'menu',
    });
    await events(outubro, [
      ['STARTED_SCHEDULING', '2026-10-30T10:00:10-03:00'],
      ['ANSWERED_SPECIALTY', '2026-10-30T10:01:00-03:00'],
      ['SLOT_SEARCH_RESULT', '2026-10-30T10:02:00-03:00'],
      ['SELECTED_SLOT', '2026-10-30T10:03:00-03:00'],
      ['APPOINTMENT_CONFIRMED', '2026-11-01T00:05:00-03:00'],
    ]);

    const novembro = await request(app).get('/api/analytics?period=month&reference=2026-11');
    expect(novembro.status).toBe(200);
    expect(novembro.body.data.funnel).toEqual([
      { stage: 'started_scheduling', count: 8, percentage: 100 },
      { stage: 'answered_specialty', count: 4, percentage: 50 },
      { stage: 'received_slot_result', count: 3, percentage: 37.5 },
      { stage: 'selected_slot', count: 2, percentage: 25 },
      { stage: 'confirmed', count: 1, percentage: 12.5 },
    ]);
    expect(novembro.body.data.conversationEndings).toEqual([
      { stage: 'triage', exited: 0, abandoned: 0 },
      { stage: 'slot_selection', exited: 1, abandoned: 0 },
      { stage: 'patient_data', exited: 0, abandoned: 1 },
      { stage: 'confirmation', exited: 1, abandoned: 0 },
    ]);

    const outubroResposta = await request(app).get('/api/analytics?period=month&reference=2026-10');
    expect(outubroResposta.body.data.funnel).toEqual([
      { stage: 'started_scheduling', count: 1, percentage: 100 },
      { stage: 'answered_specialty', count: 1, percentage: 100 },
      { stage: 'received_slot_result', count: 1, percentage: 100 },
      { stage: 'selected_slot', count: 1, percentage: 100 },
      { stage: 'confirmed', count: 1, percentage: 100 },
    ]);
  });

  it('mostra funil vazio com percentuais null e términos zerados quando ninguém iniciou', async () => {
    const response = await request(app).get('/api/analytics?period=month&reference=2026-09');
    expect(response.status).toBe(200);
    expect(response.body.data.funnel.map((linha: { count: number }) => linha.count)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(
      response.body.data.funnel.every(
        (linha: { percentage: unknown }) => linha.percentage === null,
      ),
    ).toBe(true);
    expect(response.body.data.conversationEndings).toHaveLength(4);
  });
});
