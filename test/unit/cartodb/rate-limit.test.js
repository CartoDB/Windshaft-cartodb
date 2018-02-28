require('../../support/test_helper');

const assert = require('assert');
const { getLowerRateLimit } = require('../../../lib/cartodb/api/user_limits_api');


describe('Lower rate limit', function () {
    it("1 limit: not limited", function (done) {
        const limits = [[0, 3, 1, -1, 1]];
        const result = getLowerRateLimit(limits);
        assert.deepEqual(limits[0], result);
        done();
    });

    it("1 limit: limited", function (done) {
        const limits = [[1, 3, 0, 0, 1]];
        const result = getLowerRateLimit(limits);
        assert.deepEqual(limits[0], result);
        done();
    });

    it("empty or invalid", function (done) {
        let limits = [];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = undefined;
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = null;
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [[]];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [[], []];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = {};
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [{}];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [[1, 2]];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        done();
    });

    it("multiple limits: valid and invalid", function (done) {
        const limit1 = [0, 3, 0];
        const limit2 = [0, 3, 1, 0, 1];
        
        let limits = [limit1, limit2];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(limit2, result);

        limits = [limit2, limit1];
        result = getLowerRateLimit(limits);
        assert.deepEqual(limit2, result);

        done();
    });

    it("multiple limits: not limited", function (done) {
        const limit1 = [0, 3, 2, 0, 1];
        const limit2 = [0, 3, 3, 0, 1];
        const limit3 = [0, 3, 1, 0, 1];
        const limit4 = [0, 3, 4, 0, 1];
        const limit5 = [0, 3, 5, 0, 1];
        
        let limits = [limit1, limit2, limit3, limit4, limit5];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(limit3, result);

        limits = [limit1, limit2];
        result = getLowerRateLimit(limits);
        assert.deepEqual(limit1, result);

        done();
    });

    it("multiple limits: limited", function (done) {
        const limit1 = [0, 3, 2, 0, 1];
        const limit2 = [0, 3, 3, 0, 1];
        const limit3 = [0, 3, 1, 0, 1];
        const limit4 = [0, 3, 4, 0, 1];
        const limit5 = [1, 3, 5, 0, 1];
        
        let limits = [limit1, limit2, limit3, limit4, limit5];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(limit5, result);

        limits = [limit1, limit2, limit5, limit3, limit4];
        result = getLowerRateLimit(limits);
        assert.deepEqual(limit5, result);

        done();
    });
});
