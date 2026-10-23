// "Build messages": the lead-list row and the e-mails for one verified inquiry. Plain text only.
//
// Rules:
// - Test events (local runs, preview deployments) go only to CONTACT_TEST_EMAIL, never to real people.
// - The auto-reply contains NO text from the form (not even the name): otherwise anyone could make this
//   mailbox send arbitrary text to any address they type in.
// - Sheet cells that start with = + - @ get a leading ' so Google Sheets doesn't run them as formulas.
// Addresses come from n8n's environment: CONTACT_OWNER_EMAIL, CONTACT_FROM_EMAIL (default: owner),
// CONTACT_OWNER_NAME, CONTACT_TEST_EMAIL.
const SETTINGS = /* SETTINGS */ {};

const env = (name) => {
  try {
    return String($env[name] || '');
  } catch (e) {
    return '';
  }
};

const { payload } = $input.first().json;
const inquiry = payload.inquiry;
const test = payload.test === true;
const lang = SETTINGS.texts[inquiry.locale] ? inquiry.locale : 'en';

const cell = (value) => {
  const s = String(value == null ? '' : value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};
const oneLine = (value, max) =>
  String(value == null ? '' : value)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, max);

const received = new Intl.DateTimeFormat('sv-SE', {
  timeZone: SETTINGS.timezone,
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(payload.receivedAt));

const values = [
  received,
  inquiry.name,
  inquiry.company,
  inquiry.email,
  inquiry.message,
  inquiry.source,
  lang,
  test ? 'yes' : '',
];
const row = {};
SETTINGS.columns.forEach((column, i) => {
  row[column] = cell(values[i]);
});

const owner = env('CONTACT_OWNER_EMAIL');
const from = env('CONTACT_FROM_EMAIL') || owner;
const testTo = env('CONTACT_TEST_EMAIL');
const ownerTo = test ? testTo : owner;
const senderTo = test ? testTo : inquiry.email;
const prefix = test ? '[TEST] ' : '';

const ownerMail = {
  to: ownerTo,
  from,
  replyTo: inquiry.email,
  subject: prefix + oneLine(`New inquiry from ${inquiry.name}${inquiry.company ? ` (${inquiry.company})` : ''}`, 150),
  text: [
    `Name: ${inquiry.name}`,
    `Company: ${inquiry.company || '-'}`,
    `E-mail: ${inquiry.email}`,
    `Came from: ${inquiry.source || '-'}`,
    `Language: ${lang}`,
    `Received: ${received} (${SETTINGS.timezone})`,
    '',
    inquiry.message,
    '',
    'Reply to this e-mail to answer the sender.',
  ].join('\n'),
};

const texts = SETTINGS.texts[lang];
const senderMail = {
  to: senderTo,
  from,
  subject: prefix + texts.subject,
  text: texts.body.replace('{owner}', env('CONTACT_OWNER_NAME')),
};

let skipReason = '';
if (!from || !ownerTo) skipReason = test ? 'test event without CONTACT_TEST_EMAIL' : 'CONTACT_OWNER_EMAIL is not set';

return [
  {
    json: {
      test,
      row,
      ownerMail,
      senderMail,
      sendEmails: skipReason === '',
      skipReason,
      telegramText: oneLine(
        `${prefix}New inquiry: ${inquiry.name}${inquiry.company ? ` (${inquiry.company})` : ''}`,
        200,
      ),
    },
  },
];
