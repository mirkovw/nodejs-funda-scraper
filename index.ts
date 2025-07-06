import "dotenv/config";
import cron from "node-cron";
import { startServer } from "./server/index";
import { runUpdate } from "./scraper/updater";

export async function startCronJobs() {
  // schedule incremental updates 4 times a day
  cron.schedule("0 0,6,12,18 * * *", () => {
    console.log("running update");
    runUpdate();
  });
}

(async () => {
  startServer();
  // startCronJobs();
})();
