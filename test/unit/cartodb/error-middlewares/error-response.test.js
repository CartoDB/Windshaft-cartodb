require('../../../support/test_helper');

const assert = require('assert');
const errorResponseMiddleware = require('../../../../lib/cartodb/middleware/error/error-response');

describe('error-middleware: error response', function() {

    describe('error messages clean up', function() {
        // See https://github.com/CartoDB/Windshaft/issues/173
        it("#173 does not send db details in connection error response", function() {
            const inMessage = [
                "Postgis Plugin: Bad connection",
                "Connection string: 'host=127.0.0.1 port=5432 dbname=test_windshaft_cartodb_user_1_db " +
                    "user=test_windshaft_cartodb_user_1 connect_timeout=4'",
                "  encountered during parsing of layer 'layer0' in Layer"
            ].join('\n');
    
            const req = {};
            let res = {
                errorResponseBody: null,
                json(errorResponseBody) {
                    this.errorResponseBody = JSON.stringify(errorResponseBody);
                }
            };
    
            errorResponseMiddleware()([inMessage], req, res);
            const outMessage = res.errorResponseBody;
        
            assert.ok(outMessage.match('connect'), outMessage);
            assert.ok(!outMessage.match(/666/), outMessage);
        });
    });

});
