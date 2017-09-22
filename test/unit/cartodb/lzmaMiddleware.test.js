var assert = require('assert');
var testHelper = require('../../support/test_helper');

var lzmaMiddleware = require('../../../lib/cartodb/middleware/lzma');

describe('lzma-middleware', function() {

    it('it should extend params with decoded lzma', function(done) {
        var qo = {
            config: {
                version: '1.3.0'
            }
        };
        testHelper.lzma_compress_to_base64(JSON.stringify(qo), 1, function(err, data) {
            var req = {
                headers: {
                    host:'localhost'
                },
                query: {
                    api_key: 'test',
                    lzma: data
                }
            };
            lzmaMiddleware(req, {}, function(err) {
                if ( err ) {
                    return done(err);
                }
                var query = req.query;
                assert.deepEqual(qo.config, query.config);
                assert.equal('test', query.api_key);
                done();
            });
        });
    });

});
