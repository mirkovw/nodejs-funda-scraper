import express from "express";
import { runUpdate } from "..";

export function startServer() {
  let updateRunning = false;
  const app = express();
  app.use(express.static("public"));

  app.get("/run-full-update", (req, res) => {
    if (!updateRunning) {
      updateRunning = true;
      runUpdate().then(() => {
        console.log("update done");
        updateRunning = false;
      });
    } else {
      res.send("update already running");
    }

    res.send("Running full update, should take a few minutes");
  });

  const port = 3000;
  app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
  });
}
