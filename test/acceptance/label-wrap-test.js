'use strict';

require('../support/test-helper');
var TestClient = require('../support/test-client');

var assert = require('../support/assert');
var IMAGE_TOLERANCE = 5;

describe('CartoCSS wrap', function () {
    const options = {
        sql: `
            SELECT
                5 as cartodb_id,
                ST_Transform(ST_SetSRID(ST_MakePoint(-57.65625,-15.6230368),4326),3857) as the_geom_webmercator,
                ST_SetSRID(ST_MakePoint(-57.65625,-15.62303683),4326) as the_geom,
                'South America' as continent
        `,
        cartocss: `
            #continent_points::labels {
                text-name: [continent];
                text-face-name: 'DejaVu Sans Book';
                text-size: 10;
                text-fill: lighten(#000,40);
                text-transform: uppercase;
                text-wrap-width: 30;
                text-character-spacing: 2;
                text-placement: point;
                text-placement-type: dummy;
                [zoom >= 3]{
                    text-character-spacing: 2;
                    text-size: 11;
                }
            }
        `,
        cartocss_version: '3.0.12'
    };

    const type = 'mapnik';

    const mapConfig = {
        version: '1.6.0',
        layers: [
            {
                type,
                id: 'layerLabel',
                options
            }
        ]
    };

    afterEach(function (done) {
        if (this.testClient) {
            this.testClient.drain(done);
        }
    });

    it('Label should be text-wrapped', function (done) {
        this.testClient = new TestClient(mapConfig);
        this.testClient.getTile(1, 0, 1, { layers: [0] }, (err, res, body) => {
            assert.ifError(err);
            var textWrapPath = './test/fixtures/text_wrap.png';
            assert.imageIsSimilarToFile(body, textWrapPath, IMAGE_TOLERANCE, done);
        });
    });
});
