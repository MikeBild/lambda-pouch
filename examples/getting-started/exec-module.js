module.exports = () => {
  successFunction('module', {foo: 'bar'})
    .then(data => ctx.success(Object.assign(data, {msg:'From current module'})))
    .catch(error => ctx.failure(new Error(error.message)));
};
