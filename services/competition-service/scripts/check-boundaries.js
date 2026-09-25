// Kiểm các luật ranh giới (docs/01-kien-truc.md mục 3) bằng cách đọc mọi require():
//  B1  service không require gì ngoài thư mục của nó; backend/ không require gì từ service
//  B7  module chỉ gọi module khác qua modules/<tên>/index.js, và đúng chiều phụ thuộc
//      platform/ và shared/ không được require modules/
// Chạy: npm run check-boundaries (CI chạy trước khi test). Có vi phạm → exit 1.
const fs = require('fs');
const path = require('path');

const SERVICE_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(SERVICE_ROOT, 'src');
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const BACKEND_SRC = path.join(REPO_ROOT, 'backend', 'src');

// Chiều phụ thuộc cho phép giữa các module (thêm module mới thì khai ở đây).
const ALLOWED_DEPS = {
  player: [],
  rating: ['player'],
  ranking: ['player', 'rating'],
  matchmaking: [],
  match: ['player'],
  tournament: ['player', 'rating', 'ranking', 'matchmaking', 'match'],
  session: ['player', 'rating', 'matchmaking', 'match']
};

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
        return e.name.endsWith('.js') ? [full] : [];
      })
    : [];

const requiresOf = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
};

const moduleOf = (file) => {
  const rel = path.relative(path.join(SRC, 'modules'), file);
  return rel.startsWith('..') ? null : rel.split(path.sep)[0];
};

const violations = [];
const rel = (f) => path.relative(REPO_ROOT, f).split(path.sep).join('/');

for (const file of walk(SRC)) {
  const fromModule = moduleOf(file);
  const inPlatform = file.startsWith(path.join(SRC, 'platform') + path.sep);
  const inShared = file.startsWith(path.join(SRC, 'shared') + path.sep);
  for (const spec of requiresOf(file)) {
    if (!spec.startsWith('.')) continue; // package npm
    const target = path.resolve(path.dirname(file), spec);
    if (!target.startsWith(SERVICE_ROOT + path.sep)) {
      violations.push(`B1 ${rel(file)} require ra ngoài service: ${spec}`);
      continue;
    }
    const toModule = moduleOf(target);
    if (!toModule) continue;
    if (inPlatform || inShared) {
      violations.push(`B7 ${rel(file)} (platform/shared) không được require module: ${spec}`);
      continue;
    }
    if (fromModule && toModule !== fromModule) {
      const entry = path.join(SRC, 'modules', toModule);
      const isEntry = target === entry || target === path.join(entry, 'index') || target === path.join(entry, 'index.js');
      if (!isEntry) violations.push(`B7 ${rel(file)} chui vào bên trong module ${toModule}: ${spec} (chỉ được qua modules/${toModule}/index.js)`);
      if (!(ALLOWED_DEPS[fromModule] || []).includes(toModule)) {
        violations.push(`B7 ${rel(file)}: module ${fromModule} không được phụ thuộc ${toModule}`);
      }
    }
  }
}

for (const file of walk(BACKEND_SRC)) {
  for (const spec of requiresOf(file)) {
    if (spec.includes('services/competition-service') || spec.includes('competition-service/src')) {
      violations.push(`B1 ${rel(file)} (app chính) require code của competition-service: ${spec}`);
    }
  }
}

if (violations.length) {
  console.error(`Vi phạm ranh giới (${violations.length}):\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log(`Ranh giới OK — ${walk(SRC).length} file service, ${walk(BACKEND_SRC).length} file app chính đã kiểm.`);
