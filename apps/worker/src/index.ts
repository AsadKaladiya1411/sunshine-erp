import { MessageChannel } from "node:worker_threads";
import { createWorkerApplication } from "./bootstrap.js";
import { installWorkerSignalHandlers } from "./runtime/worker-signals.js";

const application = createWorkerApplication();
const processLifetime = new MessageChannel();
processLifetime.port1.on("message", () => undefined);
let processLifetimeClosed = false;
const closeProcessLifetime = (): void => {
  if (processLifetimeClosed) {
    return;
  }
  processLifetimeClosed = true;
  processLifetime.port1.close();
  processLifetime.port2.close();
};
const disposeSignalHandlers = installWorkerSignalHandlers(
  {
    async shutdown(reason): Promise<void> {
      try {
        await application.runtime.shutdown(reason);
      } finally {
        closeProcessLifetime();
      }
    },
  },
  application.logger,
);

void application.runtime.start().catch(async () => {
  disposeSignalHandlers();
  closeProcessLifetime();
  application.logger.fatal(
    { component: "worker", stage: "startup" },
    "Worker could not start",
  );
  await application.runtime.shutdown("startup-failure").catch(() => undefined);
  process.exitCode = 1;
});
