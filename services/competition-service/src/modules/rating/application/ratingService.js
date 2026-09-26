const { Op } = require('sequelize');
const { round3 } = require('../../../shared/numbers');
const { notFound, conflict, unprocessable, forbiddenScope } = require('../../../platform/http/errors');
const { getRubric, CURRENT_VERSION } = require('../domain/rubric');
const { scoreAssessment, scoreQuickLevel, validateAnswers } = require('../domain/scoreAssessment');
const { computePeriodRatings } = require('../domain/ratingEngine');
const config = require('../domain/ratingConfig');
const { DISCIPLINES } = require('./ratingQueries');

// Lệnh ghi của module rating (docs/03 mục 2.3): tự chấm, nhân viên chấm, chấm
// nhanh, bài chấm AI, duyệt, xác nhận, chỉnh điểm. Mọi thay đổi điểm đi qua
// applyRatings → một dòng sổ điểm + sự kiện rating_changed trong cùng transaction.

const createRatingService = ({ models, sequelize, players, platform }) => {
  const { PlayerRating, Assessment, RatingChange } = models;
  const { outbox, audit } = platform;

  const rubricFor = (version) => {
    if (version !== CURRENT_VERSION) {
      throw unprocessable('RUBRIC_OUTDATED', `Bộ tiêu chí ${version} không còn dùng để chấm mới — dùng ${CURRENT_VERSION}`, [
        { field: 'rubricVersion', message: `Phải là ${CURRENT_VERSION}` }
      ]);
    }
    return getRubric(version);
  };

  const lockRatings = async (tenant, playerId, transaction) => {
    const rows = await PlayerRating.findAll({
      where: { tenantId: tenant, playerId },
      order: [['discipline', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    return Object.fromEntries(rows.map((r) => [r.discipline, r]));
  };

  const emitAssessment = (transaction, tenant, player, assessment) =>
    outbox.add(transaction, {
      type: 'competition.assessment.submitted',
      tenant,
      aggregateType: 'player',
      aggregateId: player.id,
      data: {
        assessmentId: assessment.id,
        playerId: player.id,
        externalRef: player.externalRef,
        source: assessment.source,
        status: assessment.status,
        needsVerification: assessment.needsVerification
      }
    });

  // Đặt điểm cho từng nội dung + ghi sổ + phát sự kiện.
  const applyRatings = async (transaction, { tenant, player, rows, values, reason, verified, actorRef, assessmentId = null, note = null }) => {
    const changes = [];
    for (const discipline of DISCIPLINES) {
      if (values[discipline] === undefined) continue;
      const after = round3(values[discipline]);
      const row = rows[discipline];
      const before = row ? Number(row.rating) : null;
      const verifiedFields =
        verified === undefined ? {} : { verified, verifiedByRef: verified ? actorRef : null, verifiedAt: verified ? new Date() : null };
      if (row) await row.update({ rating: after, ...verifiedFields }, { transaction });
      else {
        rows[discipline] = await PlayerRating.create(
          { tenantId: tenant, playerId: player.id, discipline, rating: after, ratedMatches: 0, ...verifiedFields },
          { transaction }
        );
      }
      await RatingChange.create(
        {
          tenantId: tenant,
          playerId: player.id,
          discipline,
          ratingBefore: before,
          ratingAfter: after,
          delta: before === null ? 0 : round3(after - before),
          reason,
          assessmentId,
          actorRef,
          note
        },
        { transaction }
      );
      await outbox.add(transaction, {
        type: 'competition.player.rating_changed',
        tenant,
        aggregateType: 'player',
        aggregateId: player.id,
        data: { playerId: player.id, externalRef: player.externalRef, discipline, before, after, reason, assessmentId }
      });
      changes.push({ discipline, before, after });
    }
    return changes;
  };

  const supersedeApplied = (transaction, tenant, playerId) =>
    Assessment.update({ status: 'superseded' }, { where: { tenantId: tenant, playerId, status: 'applied' }, transaction });

  const resultView = (result) => ({
    singles: { raw: result.singles.raw, rating: result.singles.rating, level: result.singles.level.label, cappedBy: result.singles.cappedBy },
    doubles: { raw: result.doubles.raw, rating: result.doubles.rating, level: result.doubles.level.label, cappedBy: result.doubles.cappedBy },
    needsVerification: result.needsVerification,
    gate: result.gate
  });

  const preview = ({ rubricVersion, answers, source }) =>
    resultView(scoreAssessment(answers, rubricFor(rubricVersion), { source }));

  // --- Tự chấm ---
  const submitSelf = async ({ auth, body, requestId }) => {
    const self = await players.ensureSelf(auth, { requestId });
    const rubric = rubricFor(body.rubricVersion);
    return sequelize.transaction(async (transaction) => {
      const player = await players.requireActive(auth.tenant, self.id, { transaction, lock: true });
      const rows = await lockRatings(auth.tenant, player.id, transaction);
      if (Object.values(rows).some((r) => r.ratedMatches > 0)) {
        throw conflict('SELF_ASSESSMENT_LOCKED', 'Đã có trận tính điểm — điểm giờ do kết quả thi đấu quyết định, không tự chấm lại được');
      }
      if (Object.values(rows).some((r) => r.verified)) {
        throw conflict('SELF_ASSESSMENT_LOCKED', 'Trình độ đã được nhân viên chấm / xác nhận — không tự chấm đè lên được');
      }
      const profile = body.profile || {};
      if (!profile.gender && !player.gender) {
        throw unprocessable('GENDER_REQUIRED', 'Cần khai giới tính', [{ field: 'profile.gender', message: 'Bắt buộc' }]);
      }
      if (Object.keys(profile).length) {
        await players.updateProfile({
          tenant: auth.tenant, playerId: player.id, patch: profile, isStaff: false, actorRef: auth.sub, requestId, transaction
        });
      }
      const result = scoreAssessment(body.answers, rubric, { source: 'self' });
      await supersedeApplied(transaction, auth.tenant, player.id);
      const assessment = await Assessment.create(
        {
          tenantId: auth.tenant,
          playerId: player.id,
          source: 'self',
          rubricVersion: rubric.version,
          answers: body.answers,
          profile,
          result: resultView(result),
          status: 'applied',
          needsVerification: result.needsVerification,
          submittedByRef: auth.sub
        },
        { transaction }
      );
      await applyRatings(transaction, {
        tenant: auth.tenant,
        player,
        rows,
        values: { singles: result.singles.rating, doubles: result.doubles.rating },
        reason: 'assessment',
        verified: false,
        actorRef: auth.sub,
        assessmentId: assessment.id
      });
      await emitAssessment(transaction, auth.tenant, player, assessment);
      return { assessment, result: resultView(result), playerId: player.id };
    });
  };

  // --- Nhân viên chấm đủ form ---
  const submitStaff = async ({ auth, playerId, body, requestId }) => {
    const rubric = rubricFor(body.rubricVersion);
    return sequelize.transaction(async (transaction) => {
      const player = await players.requireActive(auth.tenant, playerId, { transaction, lock: true });
      const rows = await lockRatings(auth.tenant, player.id, transaction);
      const hasMatches = Object.values(rows).some((r) => r.ratedMatches > 0);
      if (hasMatches && !auth.scopes.has('rating:assess:any')) throw forbiddenScope(['rating:assess:any']);
      if (body.profile && Object.keys(body.profile).length) {
        await players.updateProfile({
          tenant: auth.tenant, playerId: player.id, patch: body.profile, isStaff: true, actorRef: auth.sub, requestId, transaction
        });
      }
      const result = scoreAssessment(body.answers, rubric, { source: 'staff' });
      // Đã có trận: điểm do thi đấu quyết định — chỉ lưu hồ sơ (docs/03 mục 2.3).
      if (!hasMatches) await supersedeApplied(transaction, auth.tenant, player.id);
      const assessment = await Assessment.create(
        {
          tenantId: auth.tenant,
          playerId: player.id,
          source: 'staff',
          rubricVersion: rubric.version,
          answers: body.answers,
          profile: body.profile || null,
          result: resultView(result),
          status: hasMatches ? 'recorded' : 'applied',
          needsVerification: false,
          submittedByRef: auth.sub,
          note: body.note || null
        },
        { transaction }
      );
      if (!hasMatches) {
        await applyRatings(transaction, {
          tenant: auth.tenant, player, rows,
          values: { singles: result.singles.rating, doubles: result.doubles.rating },
          reason: 'assessment', verified: true, actorRef: auth.sub, assessmentId: assessment.id
        });
      }
      await emitAssessment(transaction, auth.tenant, player, assessment);
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'assessment.staff_submitted', targetType: 'player', targetId: player.id,
        after: { assessmentId: assessment.id, status: assessment.status }, requestId
      });
      return { assessment, result: resultView(result), playerId: player.id };
    });
  };

  // --- Chấm nhanh một nhãn (khách vãng lai) ---
  const quickAssess = async ({ auth, playerId, level, note, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const player = await players.requireActive(auth.tenant, playerId, { transaction, lock: true });
      const rows = await lockRatings(auth.tenant, player.id, transaction);
      if (Object.keys(rows).length) throw conflict('ALREADY_RATED', 'Người chơi đã có điểm — dùng form chấm đầy đủ');
      const result = scoreQuickLevel(level);
      const assessment = await Assessment.create(
        {
          tenantId: auth.tenant,
          playerId: player.id,
          source: 'staff_quick',
          rubricVersion: null,
          answers: { quickLevel: level },
          result: resultView(result),
          status: 'applied',
          needsVerification: false,
          submittedByRef: auth.sub,
          note: note || null
        },
        { transaction }
      );
      await applyRatings(transaction, {
        tenant: auth.tenant, player, rows,
        values: { singles: result.singles.rating, doubles: result.doubles.rating },
        reason: 'assessment', verified: false, actorRef: auth.sub, assessmentId: assessment.id
      });
      await emitAssessment(transaction, auth.tenant, player, assessment);
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'assessment.quick', targetType: 'player', targetId: player.id,
        after: { level, rating: result.singles.rating }, requestId
      });
      return { assessment, result: resultView(result), playerId: player.id };
    });

  // --- Bài chấm từ video-analysis-service: luôn chờ duyệt ---
  const submitAi = async ({ auth, playerId, body }) => {
    const rubric = rubricFor(body.rubricVersion);
    validateAnswers(body.answers, rubric, { allowNull: true });
    if (!Object.values(body.answers).some((v) => v !== null)) {
      throw unprocessable('INVALID_ANSWERS', 'Bài chấm AI phải có ít nhất một tiêu chí');
    }
    return sequelize.transaction(async (transaction) => {
      const player = await players.requireActive(auth.tenant, playerId, { transaction, lock: true });
      const assessment = await Assessment.create(
        {
          tenantId: auth.tenant,
          playerId: player.id,
          source: 'video_ai',
          rubricVersion: rubric.version,
          answers: body.answers,
          confidence: body.confidence || null,
          result: { metrics: body.metrics || null, modelVersion: body.modelVersion || null },
          status: 'pending_review',
          needsVerification: false,
          submittedByRef: auth.sub,
          evidenceRef: body.evidenceRef || null,
          matchId: body.matchId || null
        },
        { transaction }
      );
      await emitAssessment(transaction, auth.tenant, player, assessment);
      return { assessment, playerId: player.id };
    });
  };

  // --- Duyệt: bài AI chờ duyệt, hoặc bài tự chấm có cờ "cần xác nhận" ---
  const review = async ({ auth, assessmentId, decision, answers, note, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const found = await Assessment.findOne({ where: { id: assessmentId, tenantId: auth.tenant }, transaction });
      if (!found) throw notFound('Không tìm thấy bài chấm');
      const player = await players.requireActive(auth.tenant, found.playerId, { transaction, lock: true });
      const assessment = await Assessment.findOne({ where: { id: assessmentId }, transaction, lock: transaction.LOCK.UPDATE });
      const isAi = assessment.status === 'pending_review';
      const isVerification = assessment.status === 'applied' && assessment.needsVerification && !assessment.reviewedAt;
      if (!isAi && !isVerification) throw conflict('INVALID_STATE', 'Bài chấm không ở trạng thái chờ duyệt');

      const reviewed = { reviewedByRef: auth.sub, reviewedAt: new Date(), reviewNote: note || null };
      let applied = null;
      const rows = await lockRatings(auth.tenant, player.id, transaction);
      const hasMatches = Object.values(rows).some((r) => r.ratedMatches > 0);

      if (decision === 'reject') {
        await assessment.update({ ...reviewed, ...(isAi ? { status: 'rejected' } : {}) }, { transaction });
      } else if (isVerification && !answers) {
        // Đồng ý với bài tự chấm → xác nhận trình, giữ nguyên điểm.
        for (const row of Object.values(rows)) {
          await row.update({ verified: true, verifiedByRef: auth.sub, verifiedAt: new Date() }, { transaction });
        }
        await assessment.update(reviewed, { transaction });
      } else {
        // Duyệt có điền / sửa tiêu chí → tính như nhân viên chấm.
        const merged = { ...(isAi ? Object.fromEntries(Object.entries(assessment.answers).filter(([, v]) => v !== null)) : assessment.answers), ...(answers || {}) };
        const rubric = getRubric(assessment.rubricVersion) || getRubric(CURRENT_VERSION);
        const result = scoreAssessment(merged, rubric, { source: 'staff' });
        if (isAi) {
          if (!hasMatches) await supersedeApplied(transaction, auth.tenant, player.id);
          await assessment.update(
            { ...reviewed, answers: merged, result: { ...assessment.result, ...resultView(result) }, status: hasMatches ? 'recorded' : 'applied' },
            { transaction }
          );
          applied = assessment;
        } else {
          await assessment.update({ ...reviewed, status: hasMatches ? 'applied' : 'superseded' }, { transaction });
          applied = await Assessment.create(
            {
              tenantId: auth.tenant,
              playerId: player.id,
              source: 'staff',
              rubricVersion: rubric.version,
              answers: merged,
              result: resultView(result),
              status: hasMatches ? 'recorded' : 'applied',
              submittedByRef: auth.sub,
              note: note || `Duyệt bài tự chấm ${assessment.id}`
            },
            { transaction }
          );
        }
        if (!hasMatches) {
          await applyRatings(transaction, {
            tenant: auth.tenant, player, rows,
            values: { singles: result.singles.rating, doubles: result.doubles.rating },
            reason: 'assessment', verified: true, actorRef: auth.sub, assessmentId: applied.id
          });
        }
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'assessment.reviewed', targetType: 'assessment', targetId: assessment.id,
        after: { decision, appliedAssessmentId: applied ? applied.id : null }, requestId
      });
      return { assessment: await Assessment.findByPk(assessment.id, { transaction }), applied, playerId: player.id };
    });

  // --- Xác nhận trình cho một nội dung ---
  const verify = async ({ auth, playerId, discipline, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const player = await players.requireActive(auth.tenant, playerId, { transaction, lock: true });
      const rows = await lockRatings(auth.tenant, player.id, transaction);
      const row = rows[discipline];
      if (!row) throw unprocessable('NEEDS_ASSESSMENT', 'Người chơi chưa có điểm ở nội dung này');
      await row.update({ verified: true, verifiedByRef: auth.sub, verifiedAt: new Date() }, { transaction });
      if (DISCIPLINES.every((d) => rows[d] && rows[d].verified)) {
        await Assessment.update(
          { reviewedByRef: auth.sub, reviewedAt: new Date() },
          { where: { tenantId: auth.tenant, playerId: player.id, status: 'applied', needsVerification: true, reviewedAt: null }, transaction }
        );
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'rating.verified', targetType: 'player', targetId: player.id,
        after: { discipline }, requestId
      });
      return player;
    });

  // --- Quản lý chỉnh điểm tay (bắt buộc lý do) ---
  const adjust = async ({ auth, playerId, discipline, newRating, reason, requestId }) => {
    if (newRating < config.SCALE_MIN || newRating > config.SCALE_MAX) {
      throw unprocessable('RATING_OUT_OF_RANGE', `Điểm phải trong [${config.SCALE_MIN}, ${config.SCALE_MAX}]`, [{ field: 'newRating', message: 'Ngoài thang điểm' }]);
    }
    return sequelize.transaction(async (transaction) => {
      const player = await players.requireActive(auth.tenant, playerId, { transaction, lock: true });
      const rows = await lockRatings(auth.tenant, player.id, transaction);
      const before = rows[discipline] ? Number(rows[discipline].rating) : null;
      const [change] = await applyRatings(transaction, {
        tenant: auth.tenant, player, rows, values: { [discipline]: newRating },
        reason: 'adjustment', verified: true, actorRef: auth.sub, note: reason
      });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'rating.adjusted', targetType: 'player', targetId: player.id,
        before: { discipline, rating: before }, after: { discipline, rating: change.after, reason }, requestId
      });
      return { player, change };
    });
  };

  const listAssessments = async ({ tenant, status, flag, page, limit }) => {
    const where = { tenantId: tenant };
    if (flag === 'needs_verification') Object.assign(where, { status: 'applied', needsVerification: true, reviewedAt: null });
    else if (status) where.status = status;
    else where.status = 'pending_review';
    const { rows, count } = await Assessment.findAndCountAll({
      where,
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      offset: (page - 1) * limit,
      limit
    });
    return { rows, count };
  };

  // --- Gộp hồ sơ: chuyển điểm / bài chấm / sổ điểm của nguồn sang đích (docs/05 mục 4) ---
  const mergeHandler = async ({ tenant, target, source, actorRef, transaction }) => {
    const targetRows = await lockRatings(tenant, target.id, transaction);
    const sourceRows = await lockRatings(tenant, source.id, transaction);
    const decisions = {};
    for (const discipline of DISCIPLINES) {
      const s = sourceRows[discipline];
      const t = targetRows[discipline];
      if (!s) continue;
      if (!t) {
        await s.update({ playerId: target.id }, { transaction });
        decisions[discipline] = 'moved_from_source';
        continue;
      }
      const sKeeps =
        s.ratedMatches !== t.ratedMatches
          ? s.ratedMatches > t.ratedMatches
          : s.verified !== t.verified
            ? s.verified
            : new Date(s.lastMatchAt || 0) > new Date(t.lastMatchAt || 0);
      const kept = sKeeps ? s : t;
      const dropped = sKeeps ? t : s;
      const before = Number(t.rating);
      await s.destroy({ transaction });
      if (sKeeps) {
        await t.update(
          { rating: s.rating, ratedMatches: s.ratedMatches, lastMatchAt: s.lastMatchAt, verified: s.verified, verifiedByRef: s.verifiedByRef, verifiedAt: s.verifiedAt },
          { transaction }
        );
      }
      await RatingChange.create(
        {
          tenantId: tenant,
          playerId: target.id,
          discipline,
          ratingBefore: before,
          ratingAfter: Number(kept.rating),
          delta: round3(Number(kept.rating) - before),
          reason: 'merge',
          actorRef,
          note: `Gộp hồ sơ ${source.id}: giữ ${Number(kept.rating)} (${kept.ratedMatches} trận), bỏ ${Number(dropped.rating)} (${dropped.ratedMatches} trận)`
        },
        { transaction }
      );
      // Điểm của hồ sơ đích đổi → báo cho hệ thống khác (test thật phát hiện thiếu).
      if (sKeeps && Number(kept.rating) !== before) {
        await outbox.add(transaction, {
          type: 'competition.player.rating_changed',
          tenant,
          aggregateType: 'player',
          aggregateId: target.id,
          data: { playerId: target.id, externalRef: target.externalRef, discipline, before, after: Number(kept.rating), reason: 'merge', assessmentId: null }
        });
      }
      decisions[discipline] = sKeeps ? 'kept_source' : 'kept_target';
    }
    await Assessment.update({ playerId: target.id }, { where: { tenantId: tenant, playerId: source.id }, transaction });
    await RatingChange.update({ playerId: target.id }, { where: { tenantId: tenant, playerId: source.id }, transaction });
    return { ratings: decisions };
  };

  // Chặn tự đổi giới tính khi đã có trận tính điểm (docs/05 mục 1).
  const genderGuard = async ({ tenant, player, changes, isStaff, transaction }) => {
    if (isStaff || changes.gender === undefined || changes.gender === player.gender || player.gender === null) return;
    const rated = await PlayerRating.count({
      where: { tenantId: tenant, playerId: player.id, ratedMatches: { [Op.gt]: 0 } },
      transaction
    });
    if (rated > 0) throw conflict('GENDER_LOCKED', 'Đã có trận tính điểm — liên hệ nhân viên để sửa giới tính');
  };

  // --- Kỳ tính điểm (một giải / một buổi giao lưu) — docs/03 mục 3.3 ---
  // matches: định dạng của engine { matchId, sideA, sideB, games, outcome, winnerSide, weight, completedAt }
  const periodPlayerIds = (matches) => [...new Set(matches.flatMap((m) => [...m.sideA, ...m.sideB]))].sort();

  const currentInputs = (rows) =>
    rows.map((r) => ({ playerId: r.playerId, rating: Number(r.rating), ratedMatches: r.ratedMatches, lastMatchAt: r.lastMatchAt }));

  const previewPeriod = async ({ tenant, discipline, matches, now = new Date() }) => {
    const ids = periodPlayerIds(matches);
    const rows = ids.length ? await PlayerRating.findAll({ where: { tenantId: tenant, discipline, playerId: ids } }) : [];
    if (rows.length !== ids.length) throw conflict('NEEDS_ASSESSMENT', 'Có người chơi chưa có điểm ở nội dung này');
    return computePeriodRatings({ players: currentInputs(rows), matches, now });
  };

  const applyPeriod = async (transaction, { tenant, discipline, contextType, contextId, matches, actorRef, now = new Date() }) => {
    const ids = periodPlayerIds(matches);
    if (!ids.length) return { changes: [], skipped: [] };
    // Khoá theo thứ tự id — hai giải có chung người chốt cùng lúc không deadlock.
    const rows = await PlayerRating.findAll({
      where: { tenantId: tenant, discipline, playerId: ids },
      order: [['playerId', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (rows.length !== ids.length) throw conflict('NEEDS_ASSESSMENT', 'Có người chơi chưa có điểm ở nội dung này');
    const byId = new Map(rows.map((r) => [r.playerId, r]));
    const people = new Map((await players.findByIds(tenant, ids, { transaction })).map((p) => [p.id, p]));
    const result = computePeriodRatings({ players: currentInputs(rows), matches, now });
    const reason = contextType === 'session' ? 'session' : 'tournament';
    for (const change of result.changes) {
      const row = byId.get(change.playerId);
      const lastMatchAt =
        change.lastMatchAt && (!row.lastMatchAt || new Date(change.lastMatchAt) > new Date(row.lastMatchAt)) ? change.lastMatchAt : row.lastMatchAt;
      await row.update({ rating: change.after, ratedMatches: row.ratedMatches + change.ratedMatchesAdded, lastMatchAt }, { transaction });
      await RatingChange.create(
        {
          tenantId: tenant,
          playerId: change.playerId,
          discipline,
          ratingBefore: change.before,
          ratingAfter: change.after,
          delta: change.delta,
          reason,
          contextType,
          contextId,
          actorRef,
          calc: { ...change.calc, ratedMatchesAdded: change.ratedMatchesAdded }
        },
        { transaction }
      );
      const person = people.get(change.playerId);
      await outbox.add(transaction, {
        type: 'competition.player.rating_changed',
        tenant,
        aggregateType: 'player',
        aggregateId: change.playerId,
        data: {
          playerId: change.playerId, externalRef: person ? person.externalRef : null, discipline,
          before: change.before, after: change.after, reason, assessmentId: null, contextType, contextId
        }
      });
    }
    return result;
  };

  // Huỷ chốt: chỉ khi với MỌI người, dòng sổ điểm mới nhất của nội dung chính là
  // dòng của kỳ này (docs/06 mục 7.3). Không xoá dòng cũ — ghi dòng rollback.
  const rollbackPeriod = async (transaction, { tenant, discipline, contextType, contextId, actorRef }) => {
    const rows = await RatingChange.findAll({
      where: { tenantId: tenant, discipline, contextType, contextId, reason: { [Op.in]: ['tournament', 'session'] } },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      transaction
    });
    const latestOfPeriod = new Map();
    for (const r of rows) if (!latestOfPeriod.has(r.playerId)) latestOfPeriod.set(r.playerId, r);
    if (!latestOfPeriod.size) return { rolledBack: [] };
    const ids = [...latestOfPeriod.keys()].sort();
    const ratingRows = await PlayerRating.findAll({
      where: { tenantId: tenant, discipline, playerId: ids },
      order: [['playerId', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const blocked = [];
    for (const id of ids) {
      const latest = await RatingChange.findOne({
        where: { tenantId: tenant, playerId: id, discipline },
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        transaction
      });
      if (!latest || latest.id !== latestOfPeriod.get(id).id) blocked.push(id);
    }
    if (blocked.length) {
      const names = new Map((await players.findByIds(tenant, blocked, { transaction })).map((p) => [p.id, p.displayName]));
      throw conflict(
        'ROLLBACK_BLOCKED',
        `${blocked.length} người đã có thay đổi điểm sau kỳ này — không huỷ chốt được, hãy chỉnh điểm tay có lý do`,
        blocked.map((id) => ({ field: id, message: `${names.get(id) || id} đã có thay đổi điểm sau giải` }))
      );
    }
    const people = new Map((await players.findByIds(tenant, ids, { transaction })).map((p) => [p.id, p]));
    const rolledBack = [];
    for (const row of ratingRows) {
      const change = latestOfPeriod.get(row.playerId);
      const calc = change.calc || {};
      const before = Number(change.ratingAfter);
      const after = Number(change.ratingBefore);
      await row.update(
        {
          rating: after,
          ratedMatches: Math.max(0, row.ratedMatches - (calc.ratedMatchesAdded || 0)),
          lastMatchAt: calc.prevLastMatchAt ? new Date(calc.prevLastMatchAt) : null
        },
        { transaction }
      );
      await RatingChange.create(
        {
          tenantId: tenant, playerId: row.playerId, discipline, ratingBefore: before, ratingAfter: after,
          delta: round3(after - before), reason: 'rollback', contextType, contextId, actorRef,
          note: `Huỷ chốt ${contextType} ${contextId}`
        },
        { transaction }
      );
      await outbox.add(transaction, {
        type: 'competition.player.rating_changed',
        tenant,
        aggregateType: 'player',
        aggregateId: row.playerId,
        data: {
          playerId: row.playerId, externalRef: people.get(row.playerId) ? people.get(row.playerId).externalRef : null,
          discipline, before, after, reason: 'rollback', assessmentId: null, contextType, contextId
        }
      });
      rolledBack.push({ playerId: row.playerId, before, after });
    }
    return { rolledBack };
  };

  return {
    preview, submitSelf, submitStaff, quickAssess, submitAi, review, verify, adjust, listAssessments, mergeHandler, genderGuard, resultView,
    previewPeriod, applyPeriod, rollbackPeriod
  };
};

module.exports = { createRatingService };
