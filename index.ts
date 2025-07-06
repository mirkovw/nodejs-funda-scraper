import "dotenv/config";
import cron from "node-cron";
import { runUpdate } from "./scraper/updater";
import { startServer } from "./server/index";

export async function startCronJobs() {
  // schedule incremental updates 4 times a day
  cron.schedule("0 0,6,12,18 * * *", () => {
    console.log("running update");
    runUpdate();
  });
}

(async () => {
  // run initial update
  startServer();
  runUpdate();
  
  // startCronJobs();
})();
