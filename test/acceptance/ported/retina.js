var testHelper = require('../../support/test_helper');

var assert = require('../../support/assert');
var mapnik = require('windshaft').mapnik;
var cartodbServer = require('../../../lib/cartodb/server');
var ServerOptions = require('./support/ported_server_options');

var BaseController = require('../../../lib/cartodb/controllers/base');
var LayergroupToken = require('../../../lib/cartodb/models/layergroup_token');

describe('retina support', function() {

    var layergroupId = null;

    var server = cartodbServer(ServerOptions);
    server.setMaxListeners(0);

    var req2paramsFn;
    before(function() {
        req2paramsFn = BaseController.prototype.req2params;
        BaseController.prototype.req2params = ServerOptions.req2params;
    });

    after(function() {
        BaseController.prototype.req2params = req2paramsFn;
    });

    var keysToDelete;
    beforeEach(function(done) {
        keysToDelete = {'user:localhost:mapviews:global': 5};

        var retinaSampleMapConfig =  {
            version: '1.2.0',
            layers: [
                {
                    options: {
                        sql: 'SELECT * FROM populated_places_simple_reduced',
                        cartocss: '#layer { marker-fill:red; } #layer { marker-width: 2; }',
                        cartocss_version: '2.3.0',
                        geom_column: 'the_geom'
                    }
                }
            ]
        };

        assert.response(server,
            {
                url: '/database/windshaft_test/layergroup',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(retinaSampleMapConfig)
            },
            {

            },
            function (res, err) {
                assert.ok(!err, 'Failed to create layergroup');

                layergroupId = JSON.parse(res.body).layergroupid;

                done();
            }
        );
    });


    afterEach(function(done) {
        keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
        testHelper.deleteRedisKeys(keysToDelete, done);
    });


    function testRetinaImage(scaleFactor, responseHead, assertFn) {
        assert.response(server,
            {
                url: '/database/windshaft_test/layergroup/' + layergroupId + '/0/0/0' + scaleFactor + '.png',
                method: 'GET',
                encoding: 'binary'
            },
            responseHead,
            assertFn
        );
    }

    function testValidImageDimmensions(scaleFactor, imageSize, done) {
        testRetinaImage(scaleFactor,
            {
                status: 200,
                headers: {
                    'Content-Type': 'image/png'
                }
            },
            function(res, err) {
                assert.ok(!err, 'Failed to request 0/0/0' + scaleFactor + '.png tile');

                var image = new mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));

                assert.equal(image.width(), imageSize);
                assert.equal(image.height(), imageSize);
                done();
            }
        );
    }

    it('image dimensions when scale factor is not defined', function(done) {
        testValidImageDimmensions('', 256, done);
    });

    it('image dimensions when scale factor = @1x', function(done) {
        testValidImageDimmensions('@1x', 256, done);
    });

    it('image dimensions when scale factor = @2x', function(done) {
        testValidImageDimmensions('@2x', 512, done);
    });

    it('error when scale factor is not enabled', function(done) {

        var scaleFactor = '@4x';

        testRetinaImage(scaleFactor,
            {
                status: 404,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            },
            function(res, err) {
                assert.ok(!err, 'Failed to request 0/0/0' + scaleFactor + '.png tile');
                assert.deepEqual(JSON.parse(res.body), { errors: ["Tile with specified resolution not found"] } );

                done();
            }
        );
    });
});
