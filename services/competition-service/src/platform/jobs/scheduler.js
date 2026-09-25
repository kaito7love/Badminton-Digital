// Lịch việc định kỳ rất đơn giản (không thêm hạ tầng): kiểm tra mỗi phút, việc
// "hằng ngày" chạy một lần sau giờ đã hẹn theo giờ địa phương (offset cố định,
// mặc định +07:00). Việc nào lỗi chỉ ghi log, không làm sập process.

const createScheduler = ({ logger, utcOffsetMinutes = 420 }) => {
  const jobs = [];
  let timer = null;

  const localDate = (now) => new Date(now.getTime() + utcOffsetMinutes * 60000);

  const everyMinutes = (name, minutes, run) => jobs.push({ name, kind: 'interval', minutes, run, lastRun: 0 });
  const dailyAt = (name, hour, run) => jobs.push({ name, kind: 'daily', hour, run, lastDay: null });

  const tick = async (now = new Date()) => {
    for (const job of jobs) {
      try {
        if (job.kind === 'interval' && now.getTime() - job.lastRun >= job.minutes * 60000) {
          job.lastRun = now.getTime();
          await job.run(now);
        } else if (job.kind === 'daily') {
          const local = localDate(now);
          const day = local.toISOString().slice(0, 10);
          if (local.getUTCHours() >= job.hour && job.lastDay !== day) {
            job.lastDay = day;
            await job.run(now);
          }
        }
      } catch (err) {
        logger.error({ job: job.name, err: err.message }, 'scheduled job failed');
      }
    }
  };

  return {
    everyMinutes,
    dailyAt,
    tick,
    start: () => {
      if (!timer) timer = setInterval(() => tick(), 60000);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
};

module.exports = { createScheduler };
