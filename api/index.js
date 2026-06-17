const app = require('../server/index.js');
module.exports = app;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
