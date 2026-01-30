import { createAppServer } from "./server.mjs";

const server = createAppServer();

server.listen(3000, "0.0.0.0", () => {
  console.log("Listening on 0.0.0.0:3000");
});
