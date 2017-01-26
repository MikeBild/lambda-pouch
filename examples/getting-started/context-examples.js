module.exports = () => {
  res.status(201).send({
    args: args,
    context: ctx.context,
    msg: 'Hello World!',
  });
};
