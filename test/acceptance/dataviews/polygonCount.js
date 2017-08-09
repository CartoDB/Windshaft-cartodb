require('../../support/test_helper');
var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

function createMapConfig(layers, dataviews, analysis) {
    return {
        version: '1.5.0',
        layers: layers,
        dataviews: dataviews || {},
        analyses: analysis || []
    };
}

describe('boundingBox-polygon-counter', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    var mapConfig = createMapConfig(
        [
            {
                "type": "cartodb",
                "options": {
                    "source": {
                        "id": "a0"
                    },
                    "cartocss": "#points { marker-width: 10; marker-fill: red; }",
                    "cartocss_version": "2.3.0"
                }
            }
        ],
        {
            val_formula: {
                source: {
                    id: 'a0'
                },
                type: 'formula',
                options: {
                    column: "cartodb_id",
                    operation: "count",
                }
            }
        },
        [
            {
                "id": "a0",
                "type": "source",
                "params": {
                    "query": `  
                                SELECT
                                    ST_TRANSFORM(ST_SETSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-161.015625,69.28725695167886],[-162.7734375,-7.710991655433217],[-40.78125,-8.059229627200192],[-161.015625,69.28725695167886]]]}'), 4326), 3857) AS the_geom_webmercator, 1 AS cartodb_id
                                UNION ALL
                                SELECT
                                    ST_TRANSFORM(ST_SETSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-29.179687499999996,-7.01366792756663],[103.71093749999999,-6.664607562172573],[105.46875,69.16255790810501],[-29.179687499999996,-7.01366792756663]]]}'), 4326), 3857), 2
                                UNION ALL
                                SELECT
                                    ST_TRANSFORM(ST_SETSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-117.42187500000001,68.13885164925573],[-35.859375,20.96143961409684],[59.4140625,68.52823492039876],[-117.42187500000001,68.13885164925573]]]}'), 4326), 3857), 3                               
                            `
                }
            }
        ]
    );

    it('should not count the polygons outside the bounding box', function(done) {
        this.testClient = new TestClient(mapConfig, 1234);
        params = {
            bbox: '-77.34374999999999,45.82879925192134,17.578125,55.97379820507658'
        }
        this.testClient.getDataview('val_formula', params, function(err, dataview) {
            assert.equal(dataview.result, 1);
            done();
        });
    });
});