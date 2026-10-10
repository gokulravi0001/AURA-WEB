const fs = require("node:fs");
const path = require("node:path");

const dataFolder = path.join(__dirname, "..", "data");

function readJson(fileName, fallback) {
  const filePath = path.join(dataFolder, fileName);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(fileName, data) {
  fs.mkdirSync(dataFolder, { recursive: true });

  const filePath = path.join(dataFolder, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  readJson,
  writeJson,
};