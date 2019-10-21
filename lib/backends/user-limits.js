'use strict';

/**
 *
 * @param metadataBackend
 * @param options
 * @constructor
 * @type {UserLimitsBackend}
 */
function UserLimitsBackend (metadataBackend, options) {
    this.metadataBackend = metadataBackend;
    this.options = options || {};
    this.options.limits = this.options.limits || {};

    this.preprareRateLimit();
}

module.exports = UserLimitsBackend;

UserLimitsBackend.prototype.getRenderLimits = function (username, apiKey, callback) {
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

UserLimitsBackend.prototype.getTimeoutRenderLimit = function (username, apiKey, callback) {
    isAuthorized(this.metadataBackend, username, apiKey, (err, authorized) => {
        if (err) {
            return callback(err);
        }

        this.metadataBackend.getUserTimeoutRenderLimits(username, (err, timeoutRenderLimit) => {
            if (err) {
                return callback(err);
            }

            return callback(
                null,
                { render: authorized ? timeoutRenderLimit.render : timeoutRenderLimit.renderPublic }
            );
        });
    });
};

function isAuthorized (metadataBackend, username, apiKey, callback) {
    if (!apiKey) {
        return callback(null, false);
    }

    metadataBackend.getUserMapKey(username, function (err, userApiKey) {
        if (err) {
            return callback(err);
        }

        return callback(null, userApiKey === apiKey);
    });
}

UserLimitsBackend.prototype.preprareRateLimit = function () {
    if (this.options.limits.rateLimitsEnabled) {
        this.metadataBackend.loadRateLimitsScript();
    }
};

UserLimitsBackend.prototype.getRateLimit = function (user, endpointGroup, callback) {
    this.metadataBackend.getRateLimit(user, 'maps', endpointGroup, callback);
};
