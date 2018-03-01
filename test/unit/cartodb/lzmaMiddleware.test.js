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
            const lzma = lzmaMiddleware();
            var req = {
                headers: {
                    host:'localhost'
                },
                query: {
                    api_key: 'test',
                    lzma: data
                }
            };

            lzma(req, {}, function(err) {
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
