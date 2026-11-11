'use strict';
// Database used by the anonymous /api/db-health probe. Prefer the restricted runtime
// connection (rf_runtime_login, NOBYPASSRLS) that every authenticated route uses, so a
// deployment never opens a second, differently-scoped database. On Vercel previews the
// Neon integration injects its own DATABASE_URL (an automatic branch copied from
// main); with a runtime URL configured that value is never opened by any code path.
function healthDatabaseUrl(env=process.env){return env.REPAIRFLOW_RUNTIME_DATABASE_URL||env.DATABASE_URL||null}
module.exports={healthDatabaseUrl};
