require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

describe('Auth API', function () {
    const publicSQL = 'select * from test_table';
    const privateSQL = 'select * from test_table_private_1';

    const createMapConfig = ({
        version = '1.5.0',
        type = 'cartodb',
        sql = publicSQL,
        cartocss = TestClient.CARTOCSS.POINTS,
        cartocss_version = '2.3.0'
    } = {}) => ({
        version,
        layers: [
            {
                type,
                options: {
                    sql,
                    cartocss,
                    cartocss_version
                }
            }
        ]
    });

    it('should create a map using the default token', function (done) {
        const mapconfig = createMapConfig();
        const OK_RESPONSE = {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };

        this.testClient = new TestClient(mapconfig, 'public_token');

        this.testClient.getLayergroup(OK_RESPONSE, (err, result) => {
            assert.ifError(err);

            assert.ok(result.layergroupid);
            assert.ok(result.metadata);
            assert.ok(result.last_updated);

            this.testClient.drain(done);
        });
    });

    it('should fail while creating a map (private dataset) and using the default token', function (done) {
        const mapconfig = createMapConfig({ sql: privateSQL });
        const PERMISSION_DENIED_RESPONSE = {
            status: 403,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };

        this.testClient = new TestClient(mapconfig, 'public_token');

        this.testClient.getLayergroup(PERMISSION_DENIED_RESPONSE, (err, result) => {
            assert.ifError(err);
            assert.ok(Array.isArray(result.errors));
            assert.equal(result.errors.length, 1);
            this.testClient.drain(done);
        });
    });
});
