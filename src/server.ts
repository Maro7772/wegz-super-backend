import express from "express";
import http from "node:http";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import dotenv from "dotenv";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { seedRootAdmin, seedDefaultPackage } from "./services/seed.service";
import apiRoutes from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { NotFound } from "./utils/errors";
import { startSubscriptionCron } from "./services/subscription.cron";

dotenv.config();

const app = express();

// ----------------------------------------------------------------------------
// Security
// ----------------------------------------------------------------------------
app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(
  cors({
    origin: (origin, callback) => {
      // allow same-origin / curl / server-to-server
      if (!origin) return callback(null, true);

      const allowed = [
        env.SUPER_FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3001",
      ];

      if (
        allowed.includes(origin) ||
        /^https?:\/\/[a-z0-9-]+\.wego\.org(:\d+)?$/i.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ success: true, status: "ok", time: new Date().toISOString() });
});

app.use("/api", apiRoutes);

app.use((_req, _res, next) => {
  next(new NotFound("Route not found"));
});

app.use(errorHandler);

// ----------------------------------------------------------------------------
// Server
// ----------------------------------------------------------------------------
const server = http.createServer(app);
server.timeout = 300_000;
server.keepAliveTimeout = 300_000;
server.headersTimeout = 301_000;

async function bootstrap() {
  await connectDB();
  await seedRootAdmin();
  await seedDefaultPackage();
  startSubscriptionCron();

  server.listen(env.PORT, () => {
    console.log(`🚀 Super Backend listening on http://localhost:${env.PORT}`);
    console.log(`   ENV: ${env.NODE_ENV}`);
    console.log(`   Parent domain: ${env.PLESK_PARENT_DOMAIN}`);
    console.log(`   Super frontend: ${env.SUPER_FRONTEND_URL}`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});
