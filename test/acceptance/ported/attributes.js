var testHelper = require('../../support/test_helper');

var assert        = require('../../support/assert');
var step          = require('step');
var cartodbServer = require('../../../lib/cartodb/server');
var PortedServerOptions = require('./support/ported_server_options');
var BaseController = require('../../../lib/cartodb/controllers/base');

var LayergroupToken = require('../../support/layergroup-token');


describe('attributes', function() {

    var server = cartodbServer(PortedServerOptions);
    server.setMaxListeners(0);

    var test_mapconfig_1 =  {
        version: '1.1.0',
        layers: [
            { type: 'mapnik', options: {
                sql: "select 1 as id, 'SRID=4326;POINT(0 0)'::geometry as the_geom",
                cartocss: '#style { }',
                cartocss_version: '2.0.1'
            } },
            { type: 'mapnik', options: {
                sql: "select 1 as i, 6 as n, 'SRID=4326;POINT(0 0)'::geometry as the_geom",
                attributes: { id:'i', columns: ['n'] },
                cartocss: '#style { }',
                cartocss_version: '2.0.1'
            } }
        ]
    };

    function checkCORSHeaders(res) {
        assert.equal(
            res.headers['access-control-allow-headers'],
            'X-Requested-With, X-Prototype-Version, X-CSRF-Token'
        );
        assert.equal(res.headers['access-control-allow-origin'], '*');
    }

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var req2paramsFn;
    before(function() {
        req2paramsFn = BaseController.prototype.req2params;
        BaseController.prototype.req2params = PortedServerOptions.req2params;
    });

    after(function() {
        BaseController.prototype.req2params = req2paramsFn;
    });

    it("can only be fetched from layer having an attributes spec", function(done) {

            var expected_token;
            step(
                function do_post()
                {
                    var next = this;
                    assert.response(server, {
                        url: '/database/windshaft_test/layergroup',
                        method: 'POST',
                        headers: {'Content-Type': 'application/json' },
                        data: JSON.stringify(test_mapconfig_1)
                    }, {}, function(res, err) { next(err, res); });
                },
                function checkPost(err, res) {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
                    // CORS headers should be sent with response
                    // from layergroup creation via POST
                    checkCORSHeaders(res);
                    var parsedBody = JSON.parse(res.body);
                    if ( expected_token ) {
                        assert.deepEqual(parsedBody, {layergroupid: expected_token, layercount: 2});
                    } else {
                        expected_token = parsedBody.layergroupid;
                    }
                    return null;
                },
                function do_get_attr_0(err)
                {
                    assert.ifError(err);
                    var next = this;
                    assert.response(server, {
                        url: '/database/windshaft_test/layergroup/' + expected_token + '/0/attributes/1',
                        method: 'GET'
                    }, {}, function(res, err) { next(err, res); });
                },
                function check_error_0(err, res) {
                    assert.ifError(err);
                    assert.equal(
                        res.statusCode,
                        400,
                        res.statusCode + ( res.statusCode !== 200 ? (': ' + res.body) : '' )
                    );
                    var parsed = JSON.parse(res.body);
                    assert.equal(parsed.errors[0], "Layer 0 has no exposed attributes");
                    return null;
                },
                function do_get_attr_1(err)
                {
                    assert.ifError(err);
                    var next = this;
                    assert.response(server, {
                        url: '/database/windshaft_test/layergroup/' + expected_token + '/1/attributes/1',
                        method: 'GET'
                    }, {}, function(res, err) { next(err, res); });
                },
                function check_attr_1(err, res) {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
                    var parsed = JSON.parse(res.body);
                    assert.deepEqual(parsed, {"n":6});
                    return null;
                },
                function do_get_attr_1_404(err)
                {
                    assert.ifError(err);
                    var next = this;
                    assert.response(server, {
                        url: '/database/windshaft_test/layergroup/' + expected_token + '/1/attributes/-666',
                        method: 'GET'
                    }, {}, function(res, err) { next(err, res); });
                },
                function check_attr_1_404(err, res) {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 404, res.statusCode + ': ' + res.body);
                    var parsed = JSON.parse(res.body);
                    assert.ok(parsed.errors);
                    var msg = parsed.errors[0];
                    assert.ok(msg.match(/0 features.*identified by fid -666/), msg);
                    return null;
                },
                function finish(err) {
                    keysToDelete['map_cfg|' + LayergroupToken.parse(expected_token).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    done(err);
                }
            );
        });

    // See https://github.com/CartoDB/Windshaft/issues/131
    it("are checked at map creation time", function(done) {

            // clone the mapconfig test
            var mapconfig = JSON.parse(JSON.stringify(test_mapconfig_1));
            // append unexistant attribute name
            mapconfig.layers[1].options.sql = 'SELECT * FROM test_table';
            mapconfig.layers[1].options.attributes.id = 'unexistant';
            mapconfig.layers[1].options.attributes.columns = ['cartodb_id'];

            step(
                function do_post()
                {
                    var next = this;
                    assert.response(server, {
                        url: '/database/windshaft_test/layergroup',
                        method: 'POST',
                        headers: {'Content-Type': 'application/json' },
                        data: JSON.stringify(mapconfig)
                    }, {}, function(res, err) { next(err, res); });
                },
                function checkPost(err, res) {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 404, res.statusCode + ': ' + (res.statusCode===200?'...':res.body));
                    var parsed = JSON.parse(res.body);
                    assert.ok(parsed.errors);
                    assert.equal(parsed.errors.length, 1);
                    var msg = parsed.errors[0];
                    assert.equal(msg, 'column "unexistant" does not exist');
                    return null;
                },
                function finish(err) {
                    done(err);
                }
            );
        });

    it("can be used with jsonp", function(done) {

        var expected_token;
        step(
            function do_post()
            {
                var next = this;
                assert.response(server, {
                    url: '/database/windshaft_test/layergroup',
                    method: 'POST',
                    headers: {'Content-Type': 'application/json' },
                    data: JSON.stringify(test_mapconfig_1)
                }, {}, function(res, err) { next(err, res); });
            },
            function checkPost(err, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
                // CORS headers should be sent with response
                // from layergroup creation via POST
                checkCORSHeaders(res);
                var parsedBody = JSON.parse(res.body);
                if ( expected_token ) {
                    assert.deepEqual(parsedBody, {layergroupid: expected_token, layercount: 2});
                } else {
                    expected_token = parsedBody.layergroupid;
                }
                return null;
            },
            function do_get_attr_0(err)
            {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/database/windshaft_test/layergroup/' + expected_token +
                        '/0/attributes/1?callback=test',
                    method: 'GET'
                }, {}, function(res, err) { next(err, res); });
            },
            function check_error_0(err, res) {
                assert.ifError(err);
                // jsonp errors should be returned with HTTP status 200
                assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
                assert.equal(
                    res.body,
                    '/**/ typeof test === \'function\' && ' +
                    'test({"errors":["Layer 0 has no exposed attributes"],' +
                    '"errors_with_context":[{' +
                    '"type":"unknown","message":"Layer 0 has no exposed attributes"' +
                    '}]});'
                );
                return null;
            },
            function do_get_attr_1(err)
            {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/database/windshaft_test/layergroup/' + expected_token + '/1/attributes/1',
                    method: 'GET'
                }, {}, function(res, err) { next(err, res); });
            },
            function check_attr_1(err, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.deepEqual(parsed, {"n":6});
                return null;
            },
            function finish(err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expected_token).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done(err);
            }
        );
    });

    // Test that you cannot write to the database from an attributes tile request
    //
    // Test for http://github.com/CartoDB/Windshaft/issues/130
    //
    it("database access is read-only", function(done) {

        // clone the mapconfig test
        var mapconfig = JSON.parse(JSON.stringify(test_mapconfig_1));
        mapconfig.layers[1].options.sql +=
            ", test_table_inserter(st_setsrid(st_point(0,0),4326),'write') as w";
        mapconfig.layers[1].options.attributes.columns.push('w');

        step(
            function do_post()
            {
                var next = this;
                assert.response(server, {
                    url: '/database/windshaft_test/layergroup',
                    method: 'POST',
                    headers: {'Content-Type': 'application/json' },
                    data: JSON.stringify(mapconfig)
                }, {}, function(res, err) { next(err, res); });
            },
            function checkPost(err, res) {
                assert.ifError(err);
                // TODO: should be 403 Forbidden
                assert.equal(res.statusCode, 400, res.statusCode + ': ' + (res.statusCode===200?'...':res.body));
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors);
                assert.equal(parsed.errors.length, 1);
                var msg = parsed.errors[0];
                assert.equal(msg, "cannot execute INSERT in a read-only transaction");
                return null;
            },
            function finish(err) {
                done(err);
            }
        );
    });

});
