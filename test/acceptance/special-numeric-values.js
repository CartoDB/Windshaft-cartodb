require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');

describe('special numeric values', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    var ATTRIBUTES_LAYER = 1;

    function createMapConfig(sql, id, columns) {
        return {
            version: '1.6.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: "select 1 as id, 'SRID=4326;POINT(0 0)'::geometry as the_geom",
                        cartocss: '#style { }',
                        cartocss_version: '2.0.1'
                    }
                },
                {
                    type: 'mapnik',
                    options: {
                        sql: sql || "select 1 as i, 6 as n, 'SRID=4326;POINT(0 0)'::geometry as the_geom",
                        attributes: {
                            id: id || 'i',
                            columns: columns || ['n']
                        },
                        cartocss: '#style { }',
                        cartocss_version: '2.0.1'
                    }
                }
          ]
        };
    }

    it('should retrieve special numeric values', function (done) {
        var featureId = 1;
        var sql = [
            'SELECT',
            '  1 as cartodb_id,',
            '  null::geometry the_geom_webmercator,',
            '  \'infinity\'::float as infinity,',
            '  \'-infinity\'::float as _infinity,',
            '  \'NaN\'::float as nan'
        ].join('\n');
        var id = 'cartodb_id';
        var columns = ['infinity', '_infinity', 'nan'];

        var mapConfig = createMapConfig(sql, id, columns);

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getFeatureAttributes(featureId, ATTRIBUTES_LAYER, {}, function (err, attributes) {
            assert.ifError(err);
            assert.equal(attributes.infinity, 'Infinity');
            assert.equal(attributes._infinity, '-Infinity');
            assert.equal(attributes.nan, 'NaN');
            done();
        });
    });
});

