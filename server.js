const fs = require('fs');
const path = require('path');
const util = require('util');
const spawn = require('child_process').spawn;
const _ = require('lodash');
const cron = require('node-cron');
const express = require('express');
const expressCors = require('cors');
const expressBodyParser = require('body-parser');
const expressResponseTime = require('response-time');
const expressJWT = require('express-jwt');
const pouchdbExpress = require('pouchdb-express-router');
const parseDataUrl = require('parse-data-url');

const logout = require('./logout')();
const pouch = require('./lib/pouchdb');
const functions = require('./lib/functions');

const app = express();
app.disable('x-powered-by');
app.use(expressResponseTime());
app.use(expressBodyParser.json({limit: '10mb'}));
app.use(expressCors());

app.get('/_status', (req, res, next) => res.status(200).send({memMB: Math.floor((process.memoryUsage().rss / 1048576))}));

app.get('/packages', checkJWT, (req, res, next) => {
  const package = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')).toString());
  res.send(package.optionalDependencies || {});
});

app.patch('/packages', checkJWT, (req, res, next) => {
  const package = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')).toString());
  package.optionalDependencies = Object.assign(package.optionalDependencies, req.body || {});
  fs.writeFileSync(path.join(__dirname, 'package.json'), JSON.stringify(package, null, 2));
  const child = spawn('npm', ['install']);
  let output = '';
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  child.on('exit', exitCode => {
    res.send({
      packages: package.optionalDependencies,
      code: exitCode,
      message: output,
    });
  });
});

app.all('/*', checkOptionalJWT, (req, res, next) => {
  const match = req.path.split('/').filter(x => x);
  if(match[0] === 'default') return next();

  const defaultPouchDB = pouch.createPouchDB('default');
  const docid = path.parse(req.params['0']).base || req.params[0] || 'index';
  const docrev = req.query.rev || req.headers.rev;

  const query = !docrev
                  ? defaultPouchDB.find({selector: {_id : docid, doctype:'Function'}})
                      .then(data => (!(data && data.docs.length)) ? path.extname(req.path) ? Promise.reject(next()) : defaultPouchDB.get('index').then(data => ({docs: [data]})).catch(error => Promise.reject(next())) : data)
                      .then(data => (data.docs && data.docs[0] && data.docs[0].schedule) ? Promise.reject(next()) : data)
                      .then(data => ({
                        id: docid,
                        content: (data.docs && data.docs[0]) ? data.docs[0].content : undefined
                      }))
                  : defaultPouchDB.get(docid, {rev: docrev})
                      .then(data => !data ? Promise.reject(next()) : data)

  query
    .then(data => functions.exec({
      args: Object.assign({}, req.query, req.body),
      context: {environment: 'default', user: req.user, method: req.method, name: docid},
      implementation: data.content,
      res: res,
      req: req,
      next: next,
    }))
    .then(data => {
      if(data.message) return res.status(500).send({message: data.message});
      if(data.redirectURL) return res.redirect(data.redirectURL);
      if(data) return res.send(data);
    })
    .catch(error => {
      if(error && error.message && parseInt(error.message)) return res.sendStatus(parseInt(error.message));
      if(error && error.message === 'Not found') return res.status(404).send({message: error.message});
      if(error && error.message === 'missing') return res.status(404).send({message: error.message});
      if(error) return res.status(500).send({message: error.message || error});
    });
}, (req, res, next) => {
  const match = req.path.split('/').filter(x => x);
  if(match[0] === 'default') return next();
  const docid = path.parse(req.params['0']).base || req.params[0] || 'index.html';

  pouch.createPouchDB('default')
    .find({ selector: {docid:docid, doctype:'Static'} })
    .then(data => (!(data && data.docs.length)) ? Promise.reject(next()) : data)
    .then(data => ({
      id: docid,
      content: (data.docs && data.docs[0]) ? data.docs[0].content : undefined
    }))
    .then(data => {
      if(!data.content) return res.sendStatus(404);

      const parsed = parseDataUrl(data.content);
      if(parsed){
        res.type(parsed.mediaType);
        res.send(parsed.toBuffer());
        return;
      }

      res.type(docid);
      res.send(data.content);
    })
    .catch(error => res.status(500).send({message: error.message}));
});

app.use('/', checkJWT, (req, res, next) => {
  const match = req.path.split('/').filter(x => x);
  if(match[0] !== 'default') return res.sendStatus(404);

  const pouchDBWrapper = function(name, opts) {
    return pouch.createPouchDB('default');
  };

  util.inherits(pouchDBWrapper, pouch.PouchDB);
  pouchdbExpress(pouchDBWrapper)(req, res, next);
});

app.use((err, req, res, next) => {
  if(err.name === 'UnauthorizedError') return res.status(401).send({ message: err.message });
  if(err.message === 'Unauthorized') return res.status(401).send({ message: err.message });
  res.status(500).send({ message: err.message });
});

module.exports = {
  init: (options) => {
    return {
      default: () => resolveEnv('default', options),
      start: () => {
        options = resolveEnv('default', options);
        startCronJobs();
        logout.log('Starting API runtime ...');
        const server = app.listen(options.port,
          () => logout.log(`Listen on port ${server.address().port}
CouchDB sync URL: ${options.couchURL || 'none'}
JWT-Authentication: ${options.secret ? true : false}`)
          );
        return { stop: () => server.close() };
      }
    };
  }
};

let cronJobs = {};
let envsCache = {};
function resolveEnv(name, options) {
  if(!envsCache[name]) {
    envsCache[name] = Object.assign({}, options);
    envsCache[name].name = name;
    envsCache[name].pouchdb = pouch.createPouchDB(name, options);
    envsCache[name].pouchdb.changes({live: true, since: 'now', include_docs: true})
      .on('change', info => {
        if(cronJobs[info.id]) cronJobs[info.id].destroy();
        if(info.doc.doctype === 'Schedule' && info.doc.schedule) cronJobs[info.id] = cron.schedule(info.doc.schedule,()=>functions.exec({scheduled: true, args: {},context: {environment: 'default', name: info.doc.docid},implementation: info.doc.content}),true);
      });
    envsCache[name].sync = pouch.sync(envsCache[name].name, envsCache[name].couchURL, envsCache[name].continuous_sync);
  }
  return envsCache[name];
}

function checkOptionalJWT(req, res, next){
  return expressJWT({
    secret: resolveSecret,
    credentialsRequired: false,
    getToken: () => getTokenFromHeaderOrQuerystring(req),
  })(req, res, next);
}

function checkJWT(req, res, next){
  return expressJWT({
    secret: resolveSecret,
    credentialsRequired: resolveEnv('default').secret ? true : false,
    getToken: () => getTokenFromHeaderOrQuerystring(req),
  })(req, res, next);
}

function getTokenFromHeaderOrQuerystring(req) {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') return req.headers.authorization.split(' ')[1];
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function resolveSecret(req, payload, done){
  done(null, resolveEnv('default').secret);
}

function startCronJobs(){
  resolveEnv('default')
    .pouchdb
    .find({selector: {doctype: 'Schedule'}})
    .then(data => data.docs || [])
    .then(data => data.map(x => [x._id,cron.schedule(x.schedule,()=>functions.exec({scheduled: true, args: {},context: {environment: 'default', name: x.docid},implementation: x.content}),true)]))
    .then(jobs => cronJobs = _.fromPairs(jobs));
}
