require('../../support/test_helper.js');

var assert = require('assert');
var errorMiddleware = require('../../../lib/cartodb/middleware/error-middleware');

describe.only('error-middleware', function() {

    it('different formats for postgis plugin error returns 400 as status code', function() {

        var expectedStatusCode = 400;
        assert.equal(
            errorMiddleware.findStatusCode("Postgis Plugin: ERROR:  column \"missing\" does not exist\n"),
            expectedStatusCode,
            "Error status code for single line does not match"
        );

        assert.equal(
            errorMiddleware.findStatusCode("Postgis Plugin: PSQL error:\nERROR:  column \"missing\" does not exist\n"),
            expectedStatusCode,
            "Error status code for multiline/PSQL does not match"
        );
    });

    it('should return a header with errors', function (done) {
        const error = new Error('error test');

        const req = {};
        const res = {
            headers: {},
            set (key, value) {
                this.headers[key] = value;
            },
            statusCode: 0,
            status (status) {
                this.statusCode = status;
            },
            json () {},
            send () {}
        };

        const errorHeader = {
            statusCode: 400,
            message: error.message,
            name: error.name,
            moreErrors: []
        };

        const errorFn = errorMiddleware();
        errorFn(error, req, res);

        assert.deepEqual(res.headers, {
            'X-Tiler-Errors': JSON.stringify(errorHeader)
        });

        done();
    });
});
