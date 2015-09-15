require('../../../support/test_helper.js');

var assert = require('assert');
var cartodbServer = require('../../../../lib/cartodb/server');
var serverOptions = require('../../../../lib/cartodb/server_options');
var StatsClient = require('../../../../lib/cartodb/stats/client');

var LayergroupController = require('../../../../lib/cartodb/controllers/layergroup');

describe('tile stats', function() {

    var statsClientGetInstanceFn = StatsClient.getInstance;

    after(function() {
        StatsClient.getInstance = statsClientGetInstanceFn;
    });


    it('finalizeGetTileOrGrid does not call statsClient when format is not supported', function() {
        var expectedCalls = 2, // it will call increment once for the general error
            invalidFormat = 'png2',
            invalidFormatRegexp = new RegExp('invalid'),
            formatMatched = false;
        mockStatsClientGetInstance({
            increment: function(label) {
                formatMatched = formatMatched || !!label.match(invalidFormatRegexp);
                expectedCalls--;
            }
        });

        var layergroupController = new LayergroupController(cartodbServer(serverOptions));

        var reqMock = {
            params: {
                format: invalidFormat
            }
        };
        var resMock = {
            sendError: function() {}
        };
        layergroupController.finalizeGetTileOrGrid('Unsupported format png2', reqMock, resMock, null, null);

        assert.ok(formatMatched, 'Format was never matched in increment method');
        assert.equal(expectedCalls, 0, 'Unexpected number of calls to increment method');
    });

    it('finalizeGetTileOrGrid calls statsClient when format is supported', function() {
        var expectedCalls = 2, // general error + format error
            validFormat = 'png',
            validFormatRegexp = new RegExp(validFormat),
            formatMatched = false;
        mockStatsClientGetInstance({
            increment: function(label) {
                formatMatched = formatMatched || !!label.match(validFormatRegexp);
                expectedCalls--;
            }
        });
        var reqMock = {
            params: {
                format: validFormat
            }
        };
        var resMock = {
            sendError: function() {}
        };

        var layergroupController = new LayergroupController(cartodbServer(serverOptions));

        layergroupController.finalizeGetTileOrGrid('Another error happened', reqMock, resMock, null, null);

        assert.ok(formatMatched, 'Format was never matched in increment method');
        assert.equal(expectedCalls, 0, 'Unexpected number of calls to increment method');
    });

    function mockStatsClientGetInstance(instance) {
        StatsClient.getInstance = function() {
            return instance;
        };
    }

});
