const rateLimit = require('express-rate-limit');

const userRateLimiter = rateLimit({
  keyGenerator: (req) => req.user?.id || req.ip,
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later' }
});

module.exports = { userRateLimiter };