const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const OpenApiValidator = require('express-openapi-validator');
const swaggerUi = require('swagger-ui-express');

// Contract-first: openapi/competition-service.v1.yaml là nguồn sự thật. Request
// sai spec bị chặn ở đây (400); ở test bật thêm kiểm response — response nào lệch
// spec thành lỗi 500 CONTRACT_VIOLATION (docs/05 plan, "test contract").

const SPEC_PATH = path.join(__dirname, '..', '..', '..', 'openapi', 'competition-service.v1.yaml');

const loadSpec = (specPath = SPEC_PATH) => yaml.load(fs.readFileSync(specPath, 'utf8'));

const createOpenApi = ({ validateResponses = false, specPath = SPEC_PATH } = {}) => {
  const spec = loadSpec(specPath);
  const validator = OpenApiValidator.middleware({
    apiSpec: spec,
    validateRequests: { allowUnknownQueryParameters: false, coerceTypes: false },
    validateResponses: validateResponses ? { removeAdditional: false } : false,
    validateSecurity: false,
    validateFormats: true,
    ignorePaths: /^\/(health|docs|openapi\.json)/
  });

  const mountDocs = (app) => {
    app.get('/openapi.json', (req, res) => res.json(spec));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'competition-service API' }));
  };

  return { spec, validator, mountDocs };
};

module.exports = { createOpenApi, loadSpec, SPEC_PATH };
