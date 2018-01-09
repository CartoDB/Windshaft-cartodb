require('../support/test_helper');
var TestClient = require('../support/test-client');

describe('layers filters', function() {
    const type = 'mapnik';
    const sql = 'select * from populated_places_simple_reduced';
    const cartocss = `#points {
        marker-fill-opacity: 1.0;
        marker-line-color: #FFF;
        marker-line-width: 0.5;
        marker-line-opacity: 1.0;
        marker-placement: point;
        marker-type: ellipse;
        marker-width: 8;
        marker-fill: red;
        marker-allow-overlap: true;
    }`;
    const cartocss_version = '3.0.12';
    const options = {
        sql,
        cartocss,
        cartocss_version
    };

    const mapConfig = {
        version: '1.6.0',
        layers: [
            {
                type,
                id: 'layerA',
                options
            },
            {
                type,
                id: 'layerB',
                options
            }
        ]
    };

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        }
    });

    ['layerA', 'layerB'].forEach(layer => {
        it(`should work for individual layer ids: ${layer}`, function (done) {
            this.testClient = new TestClient(mapConfig);
            this.testClient.getTile(0, 0, 0, { layers: layer }, done);
        });
    });

});