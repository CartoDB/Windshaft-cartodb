'use strict';

require('../support/test-helper');

var assert = require('assert');
var errorMiddleware = require('../../lib/api/middlewares/error-middleware');

describe('error-middleware', function () {
    it('different formats for postgis plugin error returns 400 as status code', function () {
        var expectedStatusCode = 400;
        assert.strictEqual(
            errorMiddleware.findStatusCode('Postgis Plugin: ERROR:  column "missing" does not exist\n'),
            expectedStatusCode,
            'Error status code for single line does not match'
        );

        assert.strictEqual(
            errorMiddleware.findStatusCode('Postgis Plugin: PSQL error:\nERROR:  column "missing" does not exist\n'),
            expectedStatusCode,
            'Error status code for multiline/PSQL does not match'
        );
    });
});
