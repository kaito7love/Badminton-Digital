const v1 = require('./v1');

const RUBRICS = { v1 };
const CURRENT_VERSION = 'v1';

const getRubric = (version = CURRENT_VERSION) => RUBRICS[version] || null;

module.exports = { getRubric, CURRENT_VERSION, RUBRICS };
