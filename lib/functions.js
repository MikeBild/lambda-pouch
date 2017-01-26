const vm = require('vm');
const _ = require('lodash');
const EXEC_TIMEOUT = 60000;
const pouch = require('./pouchdb');
const logout = require('../logout')();
const bucket = {};

module.exports = {
  exec: exec,
};

function exec(params) {
  let implementation = params.implementation;
  if(_.isFunction(implementation)) implementation = `module.exports=${implementation.toString()}`;

  try {
    if(params.scheduled) logout.scheduler(params.context.name).log('Scheduler started');

    const scriptSandbox = {
      require: require,
      module: module,
      exports: module.exports,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      console: {
        log: logout.function(params.context.name).log,
        error: logout.function(params.context.name).error,
      },
      Buffer: Buffer,
    };

    const moduleExecutionContext = {
      pouchdb: envName => pouch.createPouchDB(envName || 'default'),
      storage: pouch.createPouchDB('default'),
      context: Object.assign({}, params.context, {variables: _.mapKeys(process.env, (value, key) => (key.indexOf('GP_') !== -1) ? key.replace('GP_', '') : null)}),
      bucket: bucket,
    };
    _.unset(moduleExecutionContext, 'context.variables.null');

    const done = new Promise((resolve, reject) => {
      moduleExecutionContext.success = resolve;
      moduleExecutionContext.failure = reject;
      moduleExecutionContext.redirect = url => resolve({redirectURL: url});
    });

    scriptSandbox.moduleExecutionContext = moduleExecutionContext;
    scriptSandbox.args = params.args || {};
    scriptSandbox.req = params.req || {};
    scriptSandbox.res = params.res || {};
    scriptSandbox.successStatic = staticName => { params.req.params[0] = staticName; params.next(); };
    scriptSandbox.successFunction = (functionName, args) => pouch
            .createPouchDB('default')
            .get(functionName)
            .then(data => !data ? Promise.reject(next()) : data)
            .then(data => exec({
              args: args,
              context: params.context,
              implementation: data.content,
              res: params.res,
              req: params.req,
              next: params.next,
            }));
    scriptSandbox.context = params.context;
    scriptSandbox.ctx = moduleExecutionContext;
    vm.createContext(scriptSandbox);
    setTimeout(() => moduleExecutionContext.failure(new Error('Execution timeout')), EXEC_TIMEOUT);
    vm.runInContext(`${implementation}\r\nmodule.exports(moduleExecutionContext, args, req, res);`, scriptSandbox, {filename: params.name, displayErrors: false, timeout: EXEC_TIMEOUT});

    // promised result
    return done;
  } catch(error) {
    logout.error(error);
    return error.message || error;
  }
}
