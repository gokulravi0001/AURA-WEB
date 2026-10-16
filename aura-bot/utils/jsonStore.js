const db = require("./database");

function readJson(fileName, fallback) {
  return db.getData(fileName, fallback);
}

function writeJson(fileName, data) {
  db.setData(fileName, data);
}

module.exports = {
  readJson,
  writeJson,
  isDbConnected: db.isDbConnected,
};