// Side-effect import: runs the --confirm-host guard. Put it FIRST in a script whose other static imports
// (db/database.js, services/otp.js, ...) must not be evaluated before the host check has passed.
import { assertConfirmedDatabaseHost } from './confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()
