import { startServer } from "./server";

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start activities-core server:", err);
  process.exitCode = 1;
});
