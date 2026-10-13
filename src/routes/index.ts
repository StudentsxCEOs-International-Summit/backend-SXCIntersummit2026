import { Router } from 'express';
import authRouter from '../features/auth/auth.route';
import adminDriveRouter from '../features/admin/admin-drive.route';
import competitionRouter from '../features/competition/competition.route';
import financeRouter from '../features/finance/finance.route';
import accessCodeRouter from '../features/accesscode/accesscode.route';
import configRouter from '../features/config/config.route';
import ibccRouter from '../features/ibcc/ibcc.route';

const routes = Router();

routes.use('/auth', authRouter);
routes.use('/admin/drive', adminDriveRouter);
routes.use('/admin/competition', competitionRouter);
routes.use('/finance', financeRouter);
routes.use('/access-code', accessCodeRouter);
routes.use('/config', configRouter);
routes.use('/ibcc', ibccRouter);

export default routes;

