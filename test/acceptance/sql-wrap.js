require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');

describe('sql-wrap', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            return done();
        }
    });

    it('should use sql_wrap from layer options', function(done) {
        var mapConfig = {
            version: '1.5.0',
            layers: [
                {
                    "type": "cartodb",
                    "options": {
                        "sql": "SELECT * FROM populated_places_simple_reduced",
                        "sql_wrap": "SELECT * FROM (<%= sql %>) _w WHERE adm0_a3 = 'USA'",
                        "cartocss": [
                            "#points {",
                            "  marker-fill-opacity: 1;",
                            "  marker-line-color: #FFF;",
                            "  marker-line-width: 0.5;",
                            "  marker-line-opacity: 1;",
                            "  marker-placement: point;",
                            "  marker-type: ellipse;",
                            "  marker-width: 8;",
                            "  marker-fill: red;",
                            "  marker-allow-overlap: true;",
                            "}"
                        ].join('\n'),
                        "cartocss_version": "2.3.0"
                    }
                }
            ]
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getTile(0, 0, 0, function(err, tile, img) {
            assert.ok(!err, err);
            var fixtureImg = './test/fixtures/sql-wrap-usa-filter.png';
            assert.imageIsSimilarToFile(img, fixtureImg, 20, done);
        });
    });

});
