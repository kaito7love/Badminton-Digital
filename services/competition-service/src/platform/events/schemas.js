const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// JSON Schema của sự kiện nằm ở contracts/events — hợp đồng dùng chung với bên
// nhận. Validator dùng cho: kiểm payload trước khi ghi outbox (dev/test) và test
// contract.

const CONTRACTS_DIR = path.join(__dirname, '..', '..', '..', 'contracts', 'events');

const createEventValidator = (dir = CONTRACTS_DIR) => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const byType = new Map();
  let envelope = null;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.schema.json'))) {
    const schema = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const validate = ajv.compile(schema);
    if (file === 'envelope.schema.json') envelope = validate;
    else byType.set(file.replace('.schema.json', ''), validate);
  }

  const check = (event) => {
    const problems = [];
    if (envelope && !envelope(event)) problems.push(...envelope.errors.map((e) => `envelope${e.instancePath} ${e.message}`));
    const validate = byType.get(event.type);
    if (!validate) problems.push(`Chưa có JSON Schema cho sự kiện ${event.type}`);
    else if (!validate(event.data)) problems.push(...validate.errors.map((e) => `data${e.instancePath} ${e.message}`));
    return problems;
  };

  const assertValid = (event) => {
    const problems = check(event);
    if (problems.length) throw new Error(`Sự kiện ${event.type} sai hợp đồng: ${problems.join('; ')}`);
  };

  return { check, assertValid, types: [...byType.keys()] };
};

module.exports = { createEventValidator, CONTRACTS_DIR };
