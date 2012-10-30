var assert      = require('../support/assert');
require(__dirname + '/../support/test_helper');
var CacheValidator = require(__dirname + '/../../lib/cartodb/cache_validator');

var VarnishEmu = require('../support/VarnishEmu');

suite('cache_validator', function() {

    test('should call purge on varnish when invalidate database', function(done) {
        var varnish = new VarnishEmu(function(cmds) {
            assert.ok(cmds.length == 1);        
            assert.equal('purge obj.http.X-Cache-Channel ~ \"^test_db:(.*test_cache.*)|(table)$\"\n', cmds[0].toString('utf8'));
            done();
        },
        function() {
            CacheValidator.init('localhost', 1337);
            CacheValidator.invalidate_db('test_db', 'test_cache');
        });
    });

});
