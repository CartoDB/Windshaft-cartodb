var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

describe('error with context', function () {
    var layerOK = {
        options: {
            sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, 5e6, 0) as the_geom_webmercator ' +
                 'from test_table',
            cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
            cartocss_version: '2.0.1',
            interactivity: 'cartodb_id'
        }
    };
    var layerKO = {
        options: {
            sql: 'select cartodb_id from test_table offset 3', // it doesn't return the_geom_webmercator so it must fail
            cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }',
            cartocss_version: '2.0.2',
            interactivity: 'cartodb_id'
        }
    };

    var DB_ERROR_MESSAGE = 'Postgis Plugin: ERROR:  column "the_geom_webmercator" does not exist';
    var scenarios = [{
        description: 'layergroup with 2 layers, second one has query error',
        layergroup: {
            version: '1.0.0',
            layers: [layerOK, layerKO]
        },
        expectedFailingLayer: { id: 'layer1', index: 1, type: 'mapnik' }
    }, {
        description: 'layergroup with 2 layers, first one has query error',
        layergroup: {
            version: '1.0.0',
            layers: [layerKO, layerOK]
        },
        expectedFailingLayer: { id: 'layer0', index: 0, type: 'mapnik' }
    }];

    scenarios.forEach(function (scenario) {
        it(scenario.description, function (done) {
            assert.response(server, {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(scenario.layergroup)
            }, {
                status: 400
            }, function (res) {
                var parsedBody = JSON.parse(res.body);

                assert.ok(Array.isArray(parsedBody.errors_with_context));

                var err = parsedBody.errors_with_context[0];
                assert.equal(err.type, 'layer');
                assert.equal(err.subtype, 'query');
                assert.ok(err.message.indexOf(DB_ERROR_MESSAGE) >= 0);
                assert.deepEqual(err.layer, scenario.expectedFailingLayer);
                done();
            });
        });
    });
});
