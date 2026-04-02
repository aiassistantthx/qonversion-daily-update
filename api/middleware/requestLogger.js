const logger = require('../lib/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: Date.now() - start
    }, 'Request completed');
  });
  next();
}

module.exports = requestLogger;
