require('../support/test_helper');

var assert = require('assert');
var redis = require('redis');
var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/cartodb/backends/template_maps');


describe('TemplateMaps limits', function() {

    var OWNER = 'username';
    var templateCounter = 0;
    function templateUniqueName() {
        return 'tpl_' + templateCounter++;
    }
    function createTemplate() {
        return {
            version: '0.0.1',
            name: templateUniqueName(),
            layergroup: {
                layers: [
                    {
                        type: 'plain',
                        options: {
                            color: 'blue'
                        }
                    }
                ]
            }
        };
    }

    var redisClient = redis.createClient(global.environment.redis.port);
    var redisPool = new RedisPool(global.environment.redis);

    afterEach(function(done) {
        redisClient.del('map_tpl|' + OWNER, done);
    });

    it('should allow to create templates when there is no limit in options', function(done) {
        var templateMaps = new TemplateMaps(redisPool);

        templateMaps.addTemplate(OWNER, createTemplate(), function(err, templateName, template) {
            assert.ok(!err, err);
            assert.ok(template);

            templateMaps.addTemplate(OWNER, createTemplate(), function(err, templateName, template) {
                assert.ok(!err, err);
                assert.ok(template);
                done();
            });
        });
    });

    it('should allow to create templates with limit in options', function(done) {
        var templateMaps = new TemplateMaps(redisPool, {max_user_templates: 1});

        templateMaps.addTemplate(OWNER, createTemplate(), function(err, templateName, template) {
            assert.ok(!err, err);
            assert.ok(template);
            done();
        });
    });

    it('should fail to create more templates than allowed by options', function(done) {
        var templateMaps = new TemplateMaps(redisPool, {max_user_templates: 1});

        templateMaps.addTemplate(OWNER, createTemplate(), function(err, templateName, template) {
            assert.ok(!err, err);
            assert.ok(template);
            templateMaps.addTemplate(OWNER, createTemplate(), function(err) {
                assert.ok(err);
                assert.equal(err.http_status, 409);
                done();
            });
        });
    });
});
