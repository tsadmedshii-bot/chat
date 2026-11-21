// Чат — Express сервер.
// .env файл ачаалахгүй (dotenv байхгүй). Ажиллуулахын өмнө:
//   set -a; source .env; set +a; npm run dev:server
// Эсвэл орчны хувьсагчуудаа шууд export хийнэ үү.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { router } from './routes';
import { HttpError } from './auth';
import { projectRoot } from './paths';

const missing: string[] = [];
if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
if (missing.length > 0) {
  console.error(
    `Алдаа: дараах орчны хувьсагч(ууд) тохируулагдаагүй байна: ${missing.join(', ')}. ` +
      'Эхлээд "set -a; source .env; set +a" гэж ачаалаад дахин ажиллуулна уу.',
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', router);

// Алдаа боловсруулагч — HttpError бол Mongolian мессеж + статус, бусад нь 500.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Серверийн алдаа гарлаа. Дахин оролдоно уу.' });
});

const clientDist = path.join(projectRoot, 'dist', 'client');
if (process.env.NODE_ENV === 'production' || fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — /api замаас бусад нь index.html руу.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`Чат сервер ажиллаж байна: http://localhost:${PORT}`);
});
