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
}

module.exports = UserLimitsApi;

UserLimitsApi.prototype.getRenderLimits = function (username, callback) {
    var self = this;
    this.metadataBackend.getTilerRenderLimit(username, function handleTilerLimits(err, renderLimit) {
        if (err) {
            return callback(err);
        }

        return callback(null, {
            cacheOnTimeout: self.options.limits.cacheOnTimeout || false,
            render: renderLimit || self.options.limits.render || 0
        });
    });
};
