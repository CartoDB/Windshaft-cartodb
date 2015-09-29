require('../../support/test_helper.js');

var assert = require('assert');
var BaseController = require('../../../lib/cartodb/controllers/base');

describe('BaseController', function() {

    it('different formats for postgis plugin error returns 400 as status code', function() {

        var expectedStatusCode = 400;
        assert.equal(
            BaseController.findStatusCode("Postgis Plugin: ERROR:  column \"missing\" does not exist\n"),
            expectedStatusCode,
            "Error status code for single line does not match"
        );

        assert.equal(
            BaseController.findStatusCode("Postgis Plugin: PSQL error:\nERROR:  column \"missing\" does not exist\n"),
            expectedStatusCode,
            "Error status code for multiline/PSQL does not match"
        );
    });
});
