const assert = require('../support/assert');
const TestClient = require('../support/test-client');

describe('error middleware', function () {
    it('should returns a errors header', function (done) {
        const mapConfig = {
            version: '1.6.0',
            layers: [{
                type: 'mapnik',
                options: {}
            }]
        };

        const errorHeader = {
            mainError: {
                statusCode: 400,
                message: "Missing cartocss for layer 0 options",
                name: "Error",
                label: "ANONYMOUS LAYERGROUP",
                type: "layer", 
            },
            moreErrors: []
        };

        this.testClient = new TestClient(mapConfig, 1234);
        
        const expectedResponse = {
            status: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Tiler-Errors': JSON.stringify(errorHeader)
            }
        };

        this.testClient.getLayergroup(expectedResponse, (err) => {
            assert.ifError(err);
            done();
        });
    });
});