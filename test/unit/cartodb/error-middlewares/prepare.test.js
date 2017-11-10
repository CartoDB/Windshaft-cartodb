const assert = require('assert');
const prepareMiddleware = require('../../../../lib/cartodb/middleware/error/prepare');

describe('error-middleware: prepare', function() {
    describe("prepare returns an array with 1 error", function() {
        const error = new Error('test error');

        const testErrors = [
            true,
            'Error test',
            123,
            error,
            [error]
        ];

        testErrors.forEach(err => {
            it('when error is: ' + typeof err, function() {
                prepareMiddleware()(err, {}, {}, function(errors) {
                    assert.equal(Array.isArray(errors), true, 'Must be array');
                    assert.equal(errors.length, 1, 'Must exists one Error');
                });
            });
        });
    });

    describe("prepare returns an array with several errors", function() {
        const error = new Error('test error');

        const testErrors = [
            [true, 123, 'Error test'],
            [error, 'error', error]
        ];

        testErrors.forEach(err => {
            it('when error is: ' + typeof err, function() {
                prepareMiddleware()(err, {}, {}, function(errors) {
                    assert.equal(Array.isArray(errors), true, 'Must be array');
                    assert.equal(errors.length, 3, 'Must exists one Error');
                });
            });
        });
    });
});