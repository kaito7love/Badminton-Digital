// Giao diện công khai của module `matchmaking`: thuật toán THUẦN (không DB) +
// endpoint tính toán không trạng thái. Không phụ thuộc module nào.
const express = require('express');
const { requireScope } = require('../../platform/http/auth');
const { ok } = require('../../platform/http/envelope');
const { formBalancedTeams } = require('./domain/formBalancedTeams');
const { drawGroups } = require('./domain/drawGroups');
const { roundRobin } = require('./domain/roundRobin');
const { scheduleSlots } = require('./domain/scheduleSlots');
const { buildBracket, nextPow2, standardOrder } = require('./domain/buildBracket');
const { fillCourts } = require('./domain/fillCourts');
const { newSeed, createRng } = require('./domain/seededRandom');
const config = require('./domain/config');

const createMatchmakingRouter = () => {
  const router = express.Router();
  const compute = (fn) => (req, res, next) => {
    try {
      return ok(res, fn(req.body));
    } catch (err) {
      return next(err);
    }
  };
  const scope = requireScope('matchmaking:compute');

  router.post('/matchmaking/teams', scope, compute((b) => formBalancedTeams(b)));
  router.post('/matchmaking/groups', scope, compute((b) => drawGroups(b)));
  router.post('/matchmaking/round-robin', scope, compute((b) => roundRobin(b.teamIds)));
  router.post('/matchmaking/schedule', scope, compute((b) => scheduleSlots(b)));
  router.post('/matchmaking/bracket', scope, compute((b) => buildBracket(b)));
  router.post(
    '/matchmaking/session-round',
    scope,
    compute((b) => fillCourts({ ...b, now: b.now ? new Date(b.now) : new Date() }))
  );
  return router;
};

module.exports = {
  createMatchmakingRouter,
  domain: { formBalancedTeams, drawGroups, roundRobin, scheduleSlots, buildBracket, nextPow2, standardOrder, fillCourts, newSeed, createRng, config }
};
