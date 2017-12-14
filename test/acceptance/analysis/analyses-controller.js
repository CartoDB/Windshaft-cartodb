require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');


describe('analyses controller', function () {
    const mapConfig = {
        version: '1.5.0',
        layers:
            [{
                type: 'cartodb',
                options:
                    {
                        source: { id: 'a1' },
                        cartocss: TestClient.CARTOCSS.POLYGONS,
                        cartocss_version: '2.3.0'
                    }
            }],
        dataviews: {},
        analyses:
            [{
                id: 'a1',
                type: 'buffer',
                params: {
                    source: {
                        type: 'source',
                        params: {
                            query: 'select * from analysis_banks limit 1'
                        }
                    },
                    radius: 250
                }
            }]
    };

    beforeEach(function () {
        this.testClient = new TestClient(mapConfig, 1234);
    });

    it('should get an array of analyses from catalog', function (done) {
        this.testClient.getAnalysesCatalog({}, (err, result) => {
            if (err) {
                return done(err);
            }

            assert.ok(Array.isArray(result.catalog));
            done();
        });
    });

    it('should support jsonp responses', function (done) {
        this.testClient.getAnalysesCatalog({ jsonp: 'jsonp_test' }, (err, result) => {
            if (err) {
                return done(err);
            }

            assert.ok(result);

            let didRunJsonCallback = false;
            // jshint ignore:start
            function jsonp_test(body) {
                assert.ok(Array.isArray(body.catalog));
                didRunJsonCallback = true;
            }

            eval(result);
            // jshint ignore:end

            assert.ok(didRunJsonCallback);

            done();
        });
    });

    it('should respond "unauthorized" when missing api_key', function (done) {
        const apiKey = this.testClient.apiKey;
        this.testClient.apiKey = null;

        this.testClient.getAnalysesCatalog({ status: 401 }, (err, result) => {
            if (err) {
                return done(err);
            }

            assert.deepEqual(result.errors[0], 'Unauthorized');
            this.testClient.apiKey = apiKey;
            done();
        });
    });

    it('should get an array of analyses from catalog', function (done) {
        this.testClient.getTile(0, 0, 0, (err) => {
            if (err) {
                return done(err);
            }

            this.testClient.getAnalysesCatalog({}, (err, result) => {
                if (err) {
                    return done(err);
                }

                assert.ok(Array.isArray(result.catalog));
                assert.ok(result.catalog.length >=  2); // buffer & source at least

                result.catalog
                    .filter(analysis => analysis.node_id === '0a215e1f3405381cf0ea6b3b0deb6fdcfdc2fcaa')
                    .forEach(analysis => assert.equal(analysis.type, 'buffer'));

                this.testClient.drain(done);
            });

        });
    });
});
