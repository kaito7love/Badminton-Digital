// Giao diện công khai của module `player` — module khác chỉ được require file này.
const { definePlayerModels } = require('./infrastructure/models');
const { createPlayerService } = require('./application/playerService');
const { createPlayerRouter } = require('./infrastructure/http/routes');
const { registerInboundHandlers } = require('./application/inboundEvents');
const profile = require('./domain/profile');

const createPlayerModule = ({ models, sequelize, platform }) => {
  const service = createPlayerService({ models, sequelize, audit: platform.audit });
  registerInboundHandlers({ inbox: platform.inbox, players: service, models });
  const router = createPlayerRouter({ players: service, idempotency: platform.idempotency });
  return { service, router };
};

module.exports = { definePlayerModels, createPlayerModule, domain: { profile } };
