'use strict';

require('../support/test_helper');

// const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const POINTS_SQL_1 = `
    select
        x + 4 as cartodb_id,
        st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
`;

const defaultLayers = [{
    type: 'cartodb',
    options: {
        sql: POINTS_SQL_1,
        aggregation: true
    }
}];

function createVectorMapConfig (layers = defaultLayers) {
    return {
        version: '1.8.0',
        layers: layers
    };
}

describe('cluster', function () {
    it.only('should get aggregated features of an aggregated map', function (done) {
        const mapConfig = createVectorMapConfig();
        const testClient = new TestClient(mapConfig);
        const clusterId = 1;
        const layerId = 0;
        const params = {};

        testClient.getClusterFeatures(clusterId, layerId, params, (err, body) => {
            if (err) {
                return done(err);
            }

            console.log('>>>>>>>>>>>>', body.rows);
            testClient.drain(done);
        });
    });
});
