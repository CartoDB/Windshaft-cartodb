'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const createMapConfig = ({
    version = '1.8.0',
    type = 'cartodb',
    sql = TestClient.SQL.ONE_POINT,
    cartocss = TestClient.CARTOCSS.POINTS,
    cartocss_version = '2.3.0',
    interactivity = 'cartodb_id'
} = {}) => ({
    version,
    layers: [{
        type,
        options: {
            source: {
                id: 'a0'
            },
            cartocss,
            cartocss_version,
            interactivity
        }
    }],
    analyses: [
        {
            id: 'a0',
            type: 'source',
            params: {
                query: sql
            }
        }
    ]
});
const coords = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 0],
    [1, 1, 1],
    [2, 0, 0],
    [2, 0, 1],
    [2, 0, 2],
    [2, 0, 3],
    [2, 1, 0],
    [2, 1, 1],
    [2, 1, 2],
    [2, 1, 3],
    [2, 2, 0],
    [2, 2, 1],
    [2, 2, 2],
    [2, 2, 3],
    [2, 3, 0],
    [2, 3, 1],
    [2, 3, 2],
    [2, 3, 3]
];

function getTiles ({ testClient, layergroupid, coords }) {
    return Promise.all(coords.map((coord) => getTile({ testClient, layergroupid, coord })));
}

function getTile ({ testClient, layergroupid, coord }) {
    return new Promise((resolve, reject) => {
        const [z, x, y] = coord;
        const params = {
            layergroupid,
            format: 'png',
            response: {
                status: [200, 429],
                headers: {
                    'Content-Type': /^(image\/png|application\/json; charset=utf-8)$/
                }
            }
        };

        testClient.getTile(z, x, y, params, (err, res, tile) => {
            if (err) {
                return reject(err);
            }

            return resolve({ res, tile });
        });
    });
}

describe('exceeding max waiting workers', function () {
    const originalPoolSize = global.environment.renderer.mapnik.poolSize;
    const poolMaxWaitingClients = global.environment.renderer.mapnik.poolMaxWaitingClients;
    const apikey = 1234;
    const testClient = new TestClient(createMapConfig(), apikey);
    let layergroupid;

    before(function (done) {
        global.environment.renderer.mapnik.poolSize = 1;
        global.environment.renderer.mapnik.poolMaxWaitingClients = 1;

        testClient.getLayergroup({ status: 200 }, (err, res) => {
            if (err) {
                return done(err);
            }

            layergroupid = res.layergroupid;
            done();
        });
    });

    after(function () {
        global.environment.renderer.mapnik.poolSize = originalPoolSize;
        global.environment.renderer.mapnik.poolMaxWaitingClients = poolMaxWaitingClients;
    });

    it('should get 429: You are over platform\'s limits', function (done) {
        const testClient = new TestClient(createMapConfig(), apikey);

        getTiles({ testClient, layergroupid, coords })
            .then((results) => {
                const errs = results
                    .filter(({ res }) => res.headers['content-type'] === 'application/json; charset=utf-8')
                    .filter(({ tile }) => tile.errors && tile.errors_with_context[0].subtype === 'render-capacity');

                assert.ok(errs.length > 0);
                testClient.drain(done);
            });
    });
});
