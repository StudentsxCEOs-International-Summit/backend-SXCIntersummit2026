import { Router } from 'express';
import authRouter from '../features/auth/auth.route';
import adminDriveRouter from '../features/admin/admin-drive.route';
import financeRouter from '../features/finance/finance.route';
import accessCodeRouter from '../features/accesscode/accesscode.route';
import configRouter from '../features/config/config.route';
import ibccRouter from '../features/ibcc/ibcc.route';
import cronRouter from './cron.route';

const routes = Router();

routes.use('/auth', authRouter);
routes.use('/admin/drive', adminDriveRouter);
routes.use('/finance', financeRouter);
routes.use('/access-code', accessCodeRouter);
routes.use('/config', configRouter);
routes.use('/ibcc', ibccRouter);
routes.use('/cron', cronRouter);

export default routes;
