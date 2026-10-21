// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the WebUntisApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { WebUntisApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new WebUntisApp({ gladys });

// --- Scene action ------------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.GET_DAY, (fields) => app.getSchoolDay(fields));

// --- Dashboard widget --------------------------------------------------------------
gladys.onWidgetGet(WIDGETS.TIMETABLE, (request) => app.getWidget(request));

// --- Configuration screen button ----------------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());

// --- Configuration changed by the user -----------------------------------------------
gladys.onConfigUpdated((config) => app.configUpdated(config));

// --- Connection lifecycle ------------------------------------------------------------
gladys.on('connected', async () => {
  try {
    await app.connected(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.on('disconnected', () => app.disconnected());
gladys.handleShutdown(() => app.shutdown());

logger.info('Starting the WebUntis integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
