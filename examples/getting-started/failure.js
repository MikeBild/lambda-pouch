module.exports = (ctx, args, req, res) => {
  ctx.failure(new Error('Custom error message'));
};
