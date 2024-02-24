const cron = require("node-cron");
const express = require("express");

const {flagger} = require('./src/flagger');

const app = express();

cron.schedule("*/30 * * * *", function () {
  console.log("---------------------");
  flagger();
  console.log("running flagger every 30 minutes");
});

app.listen(3000, () => {
  console.log("application listening.....");
});