import { app } from "./app.js";
import { environment } from "./config/environment.js";

const server = app.listen(environment.port, () => {
  console.log(`Truck Hisab backend running on http://localhost:${environment.port}`);
});

function shutdown(): void {
  server.close((error) => {
    if (error) {
      console.error("Backend shutdown failed.");
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

