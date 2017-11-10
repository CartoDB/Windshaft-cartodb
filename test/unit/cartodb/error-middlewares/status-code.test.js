const assert = require('assert');
const statusCodeMiddleware = require('../../../../lib/cartodb/middleware/error/status-code');

describe('error-middleware: status code', function() {

    const postgisErrors = [
        {
            error: "Postgis Plugin: ERROR:  column \"missing\" does not exist\n",
            message: "Error status code for single line does not match"
        },
        {
            error: "Postgis Plugin: PSQL error:\nERROR:  column \"missing\" does not exist\n",
            message: "Error status code for multiline/PSQL does not match"
        }
    ];

    postgisErrors.forEach(postgisError => {
        it('postgis plugin error ('+ postgisError.error +') returns 400 as status code', function() {
            
            const expectedStatusCode = 400;
            const req = {};
            let res = {
                statusCode: null,
                status(status) {
                    this.statusCode = status;
                }
            };
    
            statusCodeMiddleware()(postgisError.error, req, res, function() {
                assert.equal(
                    res.statusCode,  
                    expectedStatusCode,
                    postgisError.message
                );
            });
        });
    });
});
