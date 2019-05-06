'use strict';

require('../../support/test_helper');

var assert = require('../../support/assert');
var testClient = require('./support/test_client');

describe('torque tiles at 0,0 point', function() {
/*
    Tiles are represented as in:

     ---------
    | TL | TR |
    |--(0,0)--|
    | BL | BR |
     ---------
*/

    var tiles = [
        {
            what: 'tl',
            x: 3,
            y: 3,
            expects: [],
            expects_fixed: [{"x__uint8":1,"y__uint8":0,"vals__uint8":[1],"dates__uint16":[0]}]
        },
        {
            what: 'tr',
            x: 4,
            y: 3,
            expects: [],
            expects_fixed: [{"x__uint8":0,"y__uint8":0,"vals__uint8":[1],"dates__uint16":[0]}]
        },
        {
            what: 'bl',
            x: 3,
            y: 4,
            expects: [{"x__uint8":1,"y__uint8":1,"vals__uint8":[1],"dates__uint16":[0]}]
        },
        {
            what: 'br',
            x: 4,
            y: 4,
            expects: [{"x__uint8":0,"y__uint8":1,"vals__uint8":[1],"dates__uint16":[0]}]
        }
    ];

    tiles.forEach(function(tile) {
        it(tile.what, function(done) {

            var query = 'select 1 cartodb_id,' +
                ' ST_Transform(ST_SetSRID(ST_MakePoint(0, 0), 4326), 3857) the_geom_webmercator';
            var mapConfig =  {
                version: '1.3.0',
                layers: [
                    {
                        type: 'torque',
                        options: {
                            sql: query,
                            cartocss: [
                                'Map {',
                                '  -torque-time-attribute: "cartodb_id";',
                                '  -torque-aggregation-function: "count(cartodb_id)";',
                                '  -torque-frame-count: 1;',
                                '  -torque-animation-duration: 15;',
                                '  -torque-resolution: 128',
                                '}',
                                '#layer {',
                                '  marker-fill: #fff;',
                                '  marker-fill-opacity: 0.4;',
                                '  marker-width: 1;',
                                '}'
                            ].join(' '),
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            };

            testClient.getTorque(mapConfig, 0, 3, tile.x, tile.y, function(err, res) {
                assert.ok(!err, err);
                try {
                    assert.deepEqual(JSON.parse(res.body), tile.expects);
                } catch (ex) {
                    // With Proj 5.1 this bug has been fixed and the point appears in all tiles
                    assert.deepEqual(JSON.parse(res.body), tile.expects_fixed);
                }
                done();
            });
        });
    });

});
