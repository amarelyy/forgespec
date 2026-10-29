import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { AppContext } from './context';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRoutes } from './modules/auth/routes';
import { backupRoutes } from './modules/backup/routes';
import { bomRoutes } from './modules/bom/routes';
import { componentRoutes } from './modules/components/routes';
import { exportRoutes } from './modules/export/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { projectRoutes } from './modules/projects/routes';
import { rulesRoutes } from './modules/rules/routes';
import { subAssemblyRoutes } from './modules/subassemblies/routes';
import { teamRoutes } from './modules/team/routes';
import { versionRoutes } from './modules/versions/routes';

/**
 * The API Gateway: one entry point, JWT check, then per-route RBAC.
 * Guest-accessible endpoints are the ones that never call requireAuth/projectAccess
 * (auth, component search/detail/parse, health) per US-01.
 */
export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: ctx.config.corsOrigin.split(','), credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });
  app.use(authenticate(ctx.config));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ status: 'ok', distributor: ctx.distributor.providerName }));
  api.use(authRoutes(ctx));
  api.use(componentRoutes(ctx));
  api.use(rulesRoutes(ctx));
  api.use(projectRoutes(ctx));
  api.use(bomRoutes(ctx));
  api.use(versionRoutes(ctx));
  api.use(teamRoutes(ctx));
  api.use(exportRoutes(ctx));
  api.use(backupRoutes(ctx));
  api.use(subAssemblyRoutes(ctx));
  api.use(notificationRoutes(ctx));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
