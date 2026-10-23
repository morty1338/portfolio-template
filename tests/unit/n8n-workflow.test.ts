/**
 * The exported n8n workflow: up to date with its sources, free of secrets and personal data,
 * and wired the way the docs say (signature first, answer before the slow work, nothing fails the run).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWorkflow, OUTPUT, render } from '../../integrations/n8n/build-workflow.ts';

type N = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  onError?: string;
  disabled?: boolean;
  credentials?: Record<string, { id: string; name: string }>;
};
const workflow = buildWorkflow() as unknown as {
  nodes: N[];
  connections: Record<string, { main: { node: string }[][] }>;
};
const byName = (name: string) => workflow.nodes.find((n) => n.name === name)!;
const next = (name: string, branch = 0) => (workflow.connections[name]?.main[branch] ?? []).map((c) => c.node);

describe('n8n workflow', () => {
  it('the committed JSON is up to date (run: node integrations/n8n/build-workflow.ts)', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(render());
  });

  it('contains no secrets or personal data: credentials by name only, no addresses or URLs', () => {
    const json = render();
    for (const node of workflow.nodes) {
      for (const cred of Object.values(node.credentials ?? {})) expect(cred.id).toBe('');
    }
    expect(json).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no e-mail addresses
    expect(json).not.toMatch(/https?:\/\/(?!schema)/); // no URLs (webhook, sheet, chat)
    expect(json).not.toMatch(/WEBHOOK_SECRET\s*[:=]\s*['"][^'"]+/); // the secret is read from env only
  });

  it('verifies the raw body before anything else', () => {
    expect(byName('Webhook').parameters).toMatchObject({
      httpMethod: 'POST',
      responseMode: 'responseNode',
      options: { rawBody: true },
    });
    expect(next('Webhook')).toEqual(['Check signature']);
    expect(next('Valid?', 0)).toEqual(['Accept']);
    expect(next('Valid?', 1)).toEqual(['Refuse']);
  });

  it('answers the site before the slow work', () => {
    expect(next('Accept')).toEqual(['Build messages']);
  });

  it('never fails the run because of the sheet, e-mail or Telegram', () => {
    for (const name of ['Add to lead list', 'Notify owner', 'Auto-reply to sender', 'Telegram (optional)']) {
      expect(byName(name).onError, name).toBe('continueRegularOutput');
    }
    expect(byName('Telegram (optional)').disabled).toBe(true);
  });

  it('every connection points to an existing node', () => {
    const names = new Set(workflow.nodes.map((n) => n.name));
    for (const [from, { main }] of Object.entries(workflow.connections)) {
      expect(names.has(from), from).toBe(true);
      for (const branch of main) for (const c of branch) expect(names.has(c.node), c.node).toBe(true);
    }
  });

  it('node ids are stable across builds', () => {
    expect(JSON.stringify(buildWorkflow())).toBe(JSON.stringify(buildWorkflow()));
  });
});
