import { authPort } from '@danbro96/lupira-http/authPort';
import { createBearerMutator } from '@danbro96/lupira-http/mutator';
import { setApiTransport } from '@danbro96/lupira-http/transport';
import { REQUEST_TIMEOUT_MS } from '../../config';

// A side-effect module, not a function call in index.ts: import statements are hoisted above
// statements, so a call there would run *after* locationRecorder had already been evaluated and
// registered its headless task. Import order is the only ordering guarantee available here.
setApiTransport(createBearerMutator({ auth: authPort, timeoutMs: REQUEST_TIMEOUT_MS }));
