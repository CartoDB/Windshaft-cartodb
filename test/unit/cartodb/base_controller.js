require('../../support/test_helper.js');

var assert = require('assert');
var errorMiddleware = require('../../../lib/cartodb/middleware/error-middleware');

describe('error-middleware', function() {

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
        error.label = 'test label';
        error.type = 'test type';
        error.subtype = 'test subtype';

        const errors = [error, error];
        
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
            mainError: {
                statusCode: 400,
                message: error.message,
                name: error.name,
                label: error.label,
                type: error.type,
                subtype: error.subtype,
            },
            moreErrors: [{
                message: error.message,
                name: error.name,
                label: error.label,
                type: error.type,
                subtype: error.subtype
            }]
        };

        const errorFn = errorMiddleware();
        errorFn(errors, req, res);

        assert.deepEqual(res.headers, {
            'X-Tiler-Errors': JSON.stringify(errorHeader)
        });

        done();
    });

    it('JSONP should return a header with error status code', function (done) {
        const error = new Error('error test');
        error.label = 'test label';
        error.type = 'test type';
        error.subtype = 'test subtype';

        const errors = [error, error];

        const req = {
            query: { callback: true }
        };
        const res = {
            headers: {},
            set (key, value) {
                this.headers[key] = value;
            },
            statusCode: 0,
            status (status) {
                this.statusCode = status;
            },
            jsonp () {},
            send () {}
        };

        const errorHeader = {
            mainError: {
                statusCode: 400,
                message: error.message,
                name: error.name,
                label: error.label,
                type: error.type,
                subtype: error.subtype,
            },
            moreErrors: [{
                message: error.message,
                name: error.name,
                label: error.label,
                type: error.type,
                subtype: error.subtype
            }]
        };

        const errorFn = errorMiddleware();
        errorFn(errors, req, res);

        assert.deepEqual(res.headers, {
            'X-Tiler-Errors': JSON.stringify(errorHeader)
        });

        done();
    });
});
