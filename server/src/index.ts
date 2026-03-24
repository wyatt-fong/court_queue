import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startRotationWorker } from "./rotation.js";

const server = app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT}`);
});

const worker = startRotationWorker();

async function shutdown() {
  clearInterval(worker);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

