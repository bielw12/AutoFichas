// Permite executar módulos do servidor (marcados com "server-only") em scripts Node.
const Module = require("module");
const path = require("path");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "server-only") return path.join(__dirname, "server-only-noop.cjs");
  return original.call(this, request, ...args);
};
