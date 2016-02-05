var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('widget list', function() {

    it("should expose layer list", function(done) {

        var listWidgetMapConfig =  {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from test_table',
                        cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                        cartocss_version: '2.3.0',
                        widgets: {
                            names: {
                                type: 'list',
                                options: {
                                    columns: ['name']
                                }
                            }
                        }
                    }
                }
            ]
        };

        var testClient = new TestClient(listWidgetMapConfig);

        testClient.getWidget('names', function(err, res) {
            if (err) {
                return done(err);
            }

            var expectedList = [
                {name:"Hawai"},
                {name:"El Estocolmo"},
                {name:"El Rey del Tallarín"},
                {name:"El Lacón"},
                {name:"El Pico"}
            ];
            assert.deepEqual(JSON.parse(res.body).rows, expectedList);

            testClient.drain(done);
        });
    });
});
