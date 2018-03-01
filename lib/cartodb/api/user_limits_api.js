var step = require('step');


const RATE_LIMIT_REDIS_DB = 8;

/**
 *
 * @param metadataBackend
 * @param options
 * @constructor
 * @type {UserLimitsApi}
 */
function UserLimitsApi(metadataBackend, options) {
    this.metadataBackend = metadataBackend;
    this.options = options || {};
    this.options.limits = this.options.limits || {};
    this.rateLimits = {
        redisCommand: 'EVAL',
        sha: null,
        lua: getRateLimitLuaScript()
    };

    this.preprareRateLimit();
}

module.exports = UserLimitsApi;

UserLimitsApi.prototype.getRenderLimits = function (username, apiKey, callback) {
    var self = this;

    var limits = {
        cacheOnTimeout: self.options.limits.cacheOnTimeout || false,
        render: self.options.limits.render || 0
    };

    self.getTimeoutRenderLimit(username, apiKey, function (err, timeoutRenderLimit) {
        if (err) {
            return callback(err);
        }

        if (timeoutRenderLimit && timeoutRenderLimit.render) {
            if (Number.isFinite(timeoutRenderLimit.render)) {
                limits.render = timeoutRenderLimit.render;
            }
        }

        return callback(null, limits);
    });
};

UserLimitsApi.prototype.getTimeoutRenderLimit = function (username, apiKey, callback) {
    var self = this;

    step(
        function isAuthorized() {
            var next = this;

            if (!apiKey) {
                return next(null, false);
            }

            self.metadataBackend.getUserMapKey(username, function (err, userApiKey) {
                if (err) {
                    return next(err);
                }

                return next(null, userApiKey === apiKey);
            });
        },
        function getUserTimeoutRenderLimits(err, authorized) {
            var next = this;

            if (err) {
                return next(err);
            }

            self.metadataBackend.getUserTimeoutRenderLimits(username, function (err, timeoutRenderLimit) {
                if (err) {
                    return next(err);
                }

                next(null, {
                    render: authorized ? timeoutRenderLimit.render : timeoutRenderLimit.renderPublic
                });
            });
        },
        callback
    );
};

UserLimitsApi.prototype.preprareRateLimit = function () {
    var self = this;

    if (this.options.limits.rateLimitsEnabled) {
        this.metadataBackend.redisCmd(
            RATE_LIMIT_REDIS_DB, 
            'SCRIPT', 
            ['LOAD', getRateLimitLuaScript()], 
            function (err, sha) {
                if (!err && sha) {
                    self.rateLimits.sha = sha;
                    self.rateLimits.redisCommand = 'EVALSHA';
                }
            }
        );
    }
};

UserLimitsApi.prototype.getRateLimit = function (user, endpointGroup, callback) {
    var self = this;

    let redisParams = [
        this.rateLimits.redisCommand === 'EVAL' ? this.rateLimits.lua : this.rateLimits.sha,
        2,
        getStoreKey(user, endpointGroup),   // KEY[1] 
        getStatusKey(user, endpointGroup)   // KEY[2]
    ];

    this.metadataBackend.redisCmd(
        RATE_LIMIT_REDIS_DB, 
        this.rateLimits.redisCommand, 
        redisParams, 
        function (err, rateLimits) {
            if (err && err.name === 'ReplyError' && err.message === 'NOSCRIPT No matching script. Please use EVAL.') {
                self.rateLimits.redisCommand = 'EVAL';
                return self.getRateLimit(user, endpointGroup, callback);
            }

            let rateLimit;
            if (!err) {
                rateLimit = getLowerRateLimit(rateLimits);
            }
            
            callback(err, rateLimit);
        }
    );
};

/**
 * Returns Redis key where the limits are saved by user and endpoint
 * The value is a Redis hash:
 *    maxBurst (b): Integer (as string)
 *    countPerPeriod (c): Integer (as string)
 *    period (p): Integer (as string)
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStoreKey(user, endpointGroup) {
    return `limits:rate:store:${user}:maps:${endpointGroup}`;
}

/**
 * Returns Redis key where the current state of the limit by user and endpoint 
 * This key is managed by redis-cell (CL.THROTTLE command)
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStatusKey(user, endpointGroup) {
    return `limits:rate:status:${user}:maps:${endpointGroup}`;
}

function getRateLimitLuaScript() {
    return `
        local results = {}
        local resultsCounter = 0
    
        local limits = {}
        local limitsArray = redis.call("LRANGE", KEYS[1], 0, -1)
        
        for i, v in ipairs(limitsArray) do
            local rest = i % 3
            if rest ~= 0 then
                limits[rest] = v
            else
                resultsCounter = resultsCounter + 1
                results[resultsCounter] = redis.call("CL.THROTTLE", KEYS[2], limits[1], limits[2], v)
            end
        end

        return results
    `;
}

/**
 * Returns the inner rateLimit what is the strictest one
 * @param {Array} rateLimits Each inner array has 5 integers indicating: 
 *      isBloqued, limit, remaining, retry, reset
 */
function getLowerRateLimit(rateLimits) {
    /*jshint maxcomplexity:10 */
    if (!rateLimits || !Array.isArray(rateLimits) || !rateLimits.length) {
        return;
    }

    let minIndex = 0;
    let minRemainingValue;
    let currentIndex = 0;
    for (let rateLimit of rateLimits) {
        if (!validateRatelimit(rateLimit)) {
            currentIndex++;
            continue;
        }

        const [isBlocked, , remaining] = rateLimit;

        if (isBlocked === 1) {
            minIndex = currentIndex;
            break;
        }

        if (minRemainingValue === undefined || remaining < minRemainingValue) {
            minIndex = currentIndex;
            minRemainingValue = remaining;
        }

        currentIndex++;
    }

    if (validateRatelimit(rateLimits[minIndex])) {
        return rateLimits[minIndex];
    } else {
        return;
    }
}

function validateRatelimit(rateLimit) {
    return rateLimit.length === 5;
}

module.exports.getStoreKey = getStoreKey;
module.exports.getLowerRateLimit = getLowerRateLimit;
