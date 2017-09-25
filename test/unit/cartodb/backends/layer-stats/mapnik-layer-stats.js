var assert = require('assert');
var MapnikLayerStats = require('../../../../../lib/cartodb/backends/layer-stats/mapnik-layer-stats');
var MapConfig = require('windshaft').model.MapConfig;

function getDbConnectionMock () {
    return {
        query: function(sql, callback) {
            return callback(null, {
                rows: [{rows: 1}]
            });
        }
    };
}

describe('mapnik-layer-stats', function() {

    beforeEach(function () {
        this.dbConnectionMock = getDbConnectionMock();
        this.rendererCacheMock = {};
        this.params = {};
    });

    var testMapConfigOneLayer = {
        version: '1.5.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.3.0'
                }
            }
        ]
    };

    var testMapConfigTwoLayers = {
        version: '1.5.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.3.0'
                }
            },
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.3.0'
                }
            },
        ]
    };

    var testMapConfigOneLayerTwoTables = {
        version: '1.5.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.3.0',
                    affected_tables: ['test_table_1', 'test_table_2']
                }
            },
        ]
    };

    var testMapConfigTwoLayerTwoTables = {
        version: '1.5.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.3.0',
                    affected_tables: ['test_table_1', 'test_table_2']
                }
            },
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.3.0',
                    affected_tables: ['test_table_3', 'test_table_4']
                }
            },
        ]
    };

    it('should return 1 feature for one layer', function(done) {
        var mapConfig = MapConfig.create(testMapConfigOneLayer);
        var layer = mapConfig.getLayer(0);
        var testSubject = new MapnikLayerStats();
        testSubject.getStats(layer, this.dbConnectionMock, function (err, result)  {
            assert.ifError(err);
            assert.equal(result.estimatedFeatureCount, 1);
            done();
        });
    });

    it('should return 1 feature for two layers', function(done) {
        var self = this;
        var mapConfig = MapConfig.create(testMapConfigTwoLayers);
        var layer0 = mapConfig.getLayer(0);
        var layer1 = mapConfig.getLayer(1);
        var testSubject = new MapnikLayerStats();
        testSubject.getStats(layer0, self.dbConnectionMock, function (err, result)  {
            assert.ifError(err);
            assert.equal(result.estimatedFeatureCount, 1);
            testSubject.getStats(layer1, self.dbConnectionMock, function (err, result)  {
                assert.ifError(err);
                assert.equal(result.estimatedFeatureCount, 1);
                done();
            });
        });
    });

    it('should return 1 feature for one layers with two tables', function(done) {
        var mapConfig = MapConfig.create(testMapConfigOneLayerTwoTables);
        var layer = mapConfig.getLayer(0);
        var testSubject = new MapnikLayerStats();
        testSubject.getStats(layer, this.dbConnectionMock, function (err, result)  {
            assert.ifError(err);
            assert.equal(result.estimatedFeatureCount, 1);
            done();
        });
    });

    it('should return 1 feature for two layers and two tables', function(done) {
        var self = this;
        var mapConfig = MapConfig.create(testMapConfigTwoLayerTwoTables);
        var layer0 = mapConfig.getLayer(0);
        var layer1 = mapConfig.getLayer(1);
        var testSubject = new MapnikLayerStats();
        testSubject.getStats(layer0, self.dbConnectionMock, function (err, result)  {
            assert.ifError(err);
            assert.equal(result.estimatedFeatureCount, 1);
            testSubject.getStats(layer1, self.dbConnectionMock, function (err, result)  {
                assert.ifError(err);
                assert.equal(result.estimatedFeatureCount, 1);
                done();
            });
        });
    });
});
