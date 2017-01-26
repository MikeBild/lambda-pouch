const url = require('url');
const _ = require('lodash');
const fetch = require('node-fetch');
const logout = require('../logout')();
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-node-websql'));
PouchDB.plugin(require('pouchdb-find'));

module.exports = {
  PouchDB: PouchDB,
  createPouchDB: _.memoize(createPouchDB),
  sync: _.memoize(sync),
};

function createPouchDB(environment, options){
  return new PouchDB(`${environment}`, Object.assign({adapter: 'websql', auto_compaction: false}, options));
}

function sync(environment, syncDbUrl, continuous_sync){
  if(!environment) return;
  if(!syncDbUrl) return;

  const syncDbUri = url.parse(syncDbUrl);
  const syncDbNamedUrl = ((!syncDbUri.path) || (syncDbUri.path === '/'))
          ? url.resolve(syncDbUrl, environment)
          : url.resolve(syncDbUrl.replace(syncDbUri.path, ''), `${syncDbUri.path.replace(/\//g, '')}-${environment}`);

  return fetch(syncDbNamedUrl, {method: 'PUT'})
    .catch(error => error)
    .then(data => data.json())
    .then(data => {
      return createPouchDB('default')
        .sync(syncDbNamedUrl, {
          live: continuous_sync,
          retry: continuous_sync,
        });
        // .on('change', info => logout.log(`Change`))
        // .on('paused', () => logout.log(`Paused`))
        // .on('active', () => logout.log(`Active`))
        // .on('denied', info => logout.error(`Denied`))
        // .on('complete', info => logout.log(`Complete`))
        // .on('error', error => logout.error(`Error`));
    })
    .catch(error => logout.error(error));
}
