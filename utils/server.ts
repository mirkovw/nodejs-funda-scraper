import express from "express";
import { runUpdate } from "..";

export function startServer(port = 3000) {
  let updateRunning = false;
  const app = express();
  app.use(express.static("public"));

  app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
  });
}
