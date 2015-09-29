require('../../support/test_helper');

var assert = require('assert');

var BaseController = require('../../../lib/cartodb/controllers/base');

describe('error messages clean up', function() {

    // See https://github.com/CartoDB/Windshaft/issues/173
    it("#173 does not send db details in connection error response", function() {
        var inMessage = [
            "Postgis Plugin: Bad connection",
            "Connection string: 'host=127.0.0.1 port=5432 dbname=test_windshaft_cartodb_user_1_db " +
                "user=test_windshaft_cartodb_user_1 connect_timeout=4'",
            "  encountered during parsing of layer 'layer0' in Layer"
        ].join('\n');

        var outMessage = BaseController.errorMessage(inMessage);

        assert.ok(outMessage.match('connect'), outMessage);
        assert.ok(!outMessage.match(/666/), outMessage);
    });

});
