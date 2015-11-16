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
        var server = ws.listen(global.environment.windshaft_port, function() {
            assert.ok(ws);
            server.close(done); /* allow proper tear down */
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
        assert.ok(_.isObject(ws.bind));
        assert.ok(_.isObject(ws.grainstore));
        assert.equal(ws.base_url, '/tiles/:table');
    });

});
