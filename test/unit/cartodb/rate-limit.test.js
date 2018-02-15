const assert = require('assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const rateLimitMiddleware =  require('../../../lib/cartodb/middleware/rate-limit');

let redisClient;
const user = 'cdb';
const endpointGroup = 'tile';
let keysToDelete = []

function setLimit(count, period, burst) {
    redisClient.SELECT(8, function(err) {
        if (err) {
            return;
        }

        const key = 'rate-limit:store:' + user + ':' + endpointGroup;
        redisClient.hset(key, 'b', burst, 'c', count, 'p', period, function() {
            keysToDelete.push(key);
        });
    });
}

describe.only('rate-limit', function() {
    before(function() {
        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({pool: redisPool});
        this.rateLimit = rateLimitMiddleware(metadataBackend);
        
        redisClient = redis.createClient(global.environment.redis.port);
    });

    after(function() {
        keysToDelete.forEach( key => {
            redisClient.del(key);
        });
    });
    
    it("should works", function(done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        const req = {};
        const res = {
            headers: {},
            set(headers) {
                this.headers = headers;
            }
        };

        this.rateLimit(req, res, function(err) {
            assert.ok(!err, err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": burst + 1,
                "X-Rate-Limit-Remaining": burst,
                "X-Rate-Limit-Reset": period,
                "X-Rate-Limit-Retry-After": -1              
            });

            done();
        })
    })
})