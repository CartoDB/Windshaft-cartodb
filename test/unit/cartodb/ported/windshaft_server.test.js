require('../../../support/test_helper.js');

var _ = require('underscore');
var assert = require('assert');
var cartodbServer = require('../../../../lib/cartodb/server');
var serverOptions = require('../../../../lib/cartodb/server_options');


describe('windshaft', function() {

    it('should have valid global environment',  function() {
        assert.equal(global.environment.name, 'test');
    });

    it('can instantiate a Windshaft object (configured express instance)', function(){
        var ws = cartodbServer(serverOptions);
        assert.ok(ws);
    });

    it('can spawn a new server on the global listen port', function(done){
        var ws = cartodbServer(serverOptions);
        ws.listen(global.environment.windshaft_port, function() {
            assert.ok(ws);
            ws.close(done); /* allow proper tear down */
        });
    });

    it('throws exception if incorrect options passed in', function(){
        assert.throws(
            function(){
                var ws = cartodbServer({unbuffered_logging:true});
                ws.listen();
            }, /Cannot read property 'mapnik' of undefined/
        );
    });

    it('options are set on main windshaft object',  function(){
        var ws = cartodbServer(serverOptions);
        assert.ok(_.isFunction(ws.req2params));
        assert.equal(ws.base_url, '/tiles/:table');
    });

    it('different formats for postgis plugin error returns 400 as status code', function() {
        var ws = cartodbServer(serverOptions);
        var expectedStatusCode = 400;
        assert.equal(
            ws.findStatusCode("Postgis Plugin: ERROR:  column \"missing\" does not exist\n"),
            expectedStatusCode,
            "Error status code for single line does not match"
        );

        assert.equal(
            ws.findStatusCode("Postgis Plugin: PSQL error:\nERROR:  column \"missing\" does not exist\n"),
            expectedStatusCode,
            "Error status code for multiline/PSQL does not match"
        );
    });

});
