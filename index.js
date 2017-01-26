const server = require('./server');
const pouchdb = require('./lib/pouchdb');
const functions = require('./lib/functions');

module.exports = {
  server: server,
  pouchdb: pouchdb,
  functions: functions,
};
