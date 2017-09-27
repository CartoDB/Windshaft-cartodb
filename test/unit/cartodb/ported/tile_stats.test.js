require('../../../support/test_helper.js');

var assert = require('assert');

var LayergroupController = require('../../../../lib/cartodb/controllers/layergroup');

describe('tile stats', function() {

    beforeEach(function () {
        this.statsClient = global.statsClient;
    });

    afterEach(function() {
        global.statsClient  = this.statsClient;
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

        var layergroupController = new LayergroupController();

        var reqMock = {
            profiler: { toJSONString:function() {} },
            params: {
                format: invalidFormat
            }
        };
        var resMock = {
            status: function() { return this; },
            set: function() {},
            json: function() {},
            jsonp: function() {},
            send: function() {}
        };

        var next = function () {};
        layergroupController.finalizeGetTileOrGrid('Unsupported format png2', reqMock, resMock, null, null, next);

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
            profiler: { toJSONString:function() {} },
            params: {
                format: validFormat
            }
        };
        var resMock = {
            status: function() { return this; },
            set: function() {},
            json: function() {},
            jsonp: function() {},
            send: function() {}
        };

        var layergroupController = new LayergroupController();

        var next = function () {};
        layergroupController.finalizeGetTileOrGrid('Another error happened', reqMock, resMock, null, null, next);

        assert.ok(formatMatched, 'Format was never matched in increment method');
        assert.equal(expectedCalls, 0, 'Unexpected number of calls to increment method');
    });

    function mockStatsClientGetInstance(instance) {
        global.statsClient = instance;
    }

});
