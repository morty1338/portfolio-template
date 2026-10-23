/**
 * Assembles the importable n8n workflow from settings.json and the Code node sources in code/.
 * Never edit portfolio-contact.json by hand: change the sources and run
 *   node integrations/n8n/build-workflow.ts
 * A test fails when the committed JSON is out of date.
 *
 * The JSON holds no secrets and no personal data:
 * - credentials are referenced by name only (empty id); n8n links them on import;
 * - addresses, the sheet ID and the Telegram chat come from n8n's environment ($env) at run time.
 *
 * Runs with Node's built-in TypeScript support, so only Node imports and erasable syntax are used.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT = path.join(HERE, 'portfolio-contact.json');
/** Namespace for stable node ids: rebuilding without changes produces no diff. */
const NAMESPACE = '0c5f1d7e-3b1a-5f2e-9a44-6f2d8c1b7e90';

type Settings = {
  workflowName: string;
  webhookPath: string;
  timezone: string;
  sheetName: string;
  columns: string[];
  [key: string]: unknown;
};

export const settings: Settings = JSON.parse(readFileSync(path.join(HERE, 'settings.json'), 'utf8'));

/** RFC 4122 version-5 UUID (SHA-1 of namespace + name). */
export function uuid5(name: string, namespace = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Code node source with the settings inlined (Code nodes can't import files). */
export function codeWithSettings(name: string): string {
  const source = readFileSync(path.join(HERE, 'code', `${name}.js`), 'utf8');
  const marker = '/* SETTINGS */ {}';
  if (!source.includes(marker)) throw new Error(`${name}.js: missing "${marker}"`);
  return source.replace(marker, JSON.stringify(settings));
}

type Node = Record<string, unknown> & { name: string };

const node = (
  name: string,
  type: string,
  typeVersion: number,
  position: [number, number],
  parameters: object,
  extra: object = {},
): Node => ({
  parameters,
  id: uuid5(name),
  name,
  type,
  typeVersion,
  position,
  ...extra,
});

/** Messaging and storage nodes must never fail the run: an error becomes a normal output item. */
const keepGoing = { onError: 'continueRegularOutput' };
const credential = (type: string, name: string) => ({ credentials: { [type]: { id: '', name } } });
const fromBuild = (field: string) => `={{ $('Build messages').item.json.${field} }}`;

const respond = (name: string, position: [number, number], status: string, body: string) =>
  node(name, 'n8n-nodes-base.respondToWebhook', 1.4, position, {
    respondWith: 'json',
    responseBody: body,
    options: { responseCode: status },
  });

const isTrue = (name: string, left: string) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [
      {
        id: uuid5(`${name}:condition`),
        leftValue: left,
        rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      },
    ],
    combinator: 'and',
  },
  options: {},
});

const sendEmail = (name: string, position: [number, number], mail: 'ownerMail' | 'senderMail') =>
  node(
    name,
    'n8n-nodes-base.emailSend',
    2.1,
    position,
    {
      fromEmail: fromBuild(`${mail}.from`),
      toEmail: fromBuild(`${mail}.to`),
      subject: fromBuild(`${mail}.subject`),
      emailFormat: 'text',
      text: fromBuild(`${mail}.text`),
      options: {
        appendAttribution: false,
        ...(mail === 'ownerMail' ? { replyTo: fromBuild('ownerMail.replyTo') } : {}),
      },
    },
    { ...keepGoing, ...credential('smtp', 'SMTP – portfolio contact') },
  );

export function buildWorkflow() {
  const nodes: Node[] = [
    node(
      'Webhook',
      'n8n-nodes-base.webhook',
      2.1,
      [0, 300],
      { httpMethod: 'POST', path: settings.webhookPath, responseMode: 'responseNode', options: { rawBody: true } },
      { webhookId: uuid5('webhook') },
    ),
    node('Check signature', 'n8n-nodes-base.code', 2, [220, 300], { jsCode: codeWithSettings('check_signature') }),
    node('Valid?', 'n8n-nodes-base.if', 2.2, [440, 300], isTrue('Valid?', '={{ $json.ok }}')),
    // Answer the site before the slow work: the visitor is waiting for the form's response.
    respond('Accept', [660, 200], '200', '={{ { "ok": true } }}'),
    respond('Refuse', [660, 420], '={{ $json.status }}', '={{ { "ok": $json.status < 300, "reason": $json.reason } }}'),
    node('Build messages', 'n8n-nodes-base.code', 2, [880, 200], { jsCode: codeWithSettings('build_messages') }),
    node(
      'Add to lead list',
      'n8n-nodes-base.googleSheets',
      4.5,
      [1100, 200],
      {
        authentication: 'serviceAccount',
        operation: 'append',
        documentId: { __rl: true, mode: 'id', value: '={{ $env.CONTACT_SHEET_ID }}' },
        sheetName: { __rl: true, mode: 'name', value: settings.sheetName },
        columns: {
          mappingMode: 'defineBelow',
          value: Object.fromEntries(settings.columns.map((c) => [c, `={{ $json.row[${JSON.stringify(c)}] }}`])),
          matchingColumns: [],
          schema: settings.columns.map((c) => ({
            id: c,
            displayName: c,
            required: false,
            defaultMatch: false,
            display: true,
            type: 'string',
            canBeUsedToMatch: true,
          })),
        },
        options: {},
      },
      { ...keepGoing, ...credential('googleApi', 'Google service account – portfolio contact') },
    ),
    node(
      'E-mails allowed?',
      'n8n-nodes-base.if',
      2.2,
      [1320, 200],
      isTrue('E-mails allowed?', fromBuild('sendEmails')),
    ),
    sendEmail('Notify owner', [1540, 100], 'ownerMail'),
    sendEmail('Auto-reply to sender', [1760, 100], 'senderMail'),
    node(
      'Telegram (optional)',
      'n8n-nodes-base.telegram',
      1.2,
      [1980, 100],
      {
        chatId: '={{ $env.CONTACT_TELEGRAM_CHAT_ID }}',
        text: fromBuild('telegramText'),
        additionalFields: { appendAttribution: false },
      },
      // Off by default; enable in n8n after adding the bot credential and the chat id.
      { disabled: true, ...keepGoing, ...credential('telegramApi', 'Telegram bot – portfolio contact') },
    ),
  ];

  const to = (target: string) => [{ node: target, type: 'main', index: 0 }];
  const connections = {
    Webhook: { main: [to('Check signature')] },
    'Check signature': { main: [to('Valid?')] },
    'Valid?': { main: [to('Accept'), to('Refuse')] },
    Accept: { main: [to('Build messages')] },
    'Build messages': { main: [to('Add to lead list')] },
    'Add to lead list': { main: [to('E-mails allowed?')] },
    'E-mails allowed?': { main: [to('Notify owner'), []] },
    'Notify owner': { main: [to('Auto-reply to sender')] },
    'Auto-reply to sender': { main: [to('Telegram (optional)')] },
  };

  return {
    name: settings.workflowName,
    nodes,
    connections,
    settings: { executionOrder: 'v1', timezone: settings.timezone },
    pinData: {},
    active: false,
  };
}

export const render = () => JSON.stringify(buildWorkflow(), null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, render());
  console.log(`wrote ${path.relative(process.cwd(), OUTPUT)}`);
}
