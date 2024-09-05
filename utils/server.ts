import express from "express";

export function startServer() {
  const app = express();
  app.use(express.static("public"));

  app.get("/updateDb", (req, res) => {
    console;
    res.send("Updating db...");
  });

  const port = 3000;
  app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
  });
}
