'use strict';

require('../support/test-helper');

var assert = require('assert');
var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/backends/template-maps');
var _ = require('underscore');

describe('template_maps', function () {
    var redisPool = new RedisPool(global.environment.redis);
    var templateMaps = new TemplateMaps(redisPool);

    var owner = 'me';
    var templateName = 'wadus';

    var defaultTemplate = {
        version: '0.0.1',
        name: templateName,
        layergroup: {
            layers: [
                {
                    options: {
                        sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
                        cartocss: '#layer { marker-fill:blue; }',
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        }
    };

    function makeTemplate (auth, placeholders) {
        return _.extend({}, defaultTemplate, {
            auth: auth,
            placeholders: placeholders
        });
    }

    var defaultAuth = {
        method: 'open'
    };

    var authTokenSample = {
        method: 'token',
        valid_tokens: ['wadus_token']
    };

    var placeholdersSample = {
        wadus: {
            type: 'number',
            default: 1
        }
    };

    var testScenarios = [
        {
            desc: 'default auth and placeholders values',
            template: defaultTemplate,
            expected: {
                auth: defaultAuth,
                placeholders: {}
            }
        },
        {
            desc: 'default placeholders but specified auth',
            template: makeTemplate(authTokenSample),
            expected: {
                auth: authTokenSample,
                placeholders: {}
            }
        },
        {
            desc: 'default auth but specified placeholders',
            template: makeTemplate(undefined, placeholdersSample),
            expected: {
                auth: defaultAuth,
                placeholders: placeholdersSample
            }
        },
        {
            desc: 'specified auth and placeholders',
            template: makeTemplate(authTokenSample, placeholdersSample),
            expected: {
                auth: authTokenSample,
                placeholders: placeholdersSample
            }
        }
    ];

    testScenarios.forEach(function (testScenario) {
        it('adding template returns a new instance with ' + testScenario.desc, function (done) {
            templateMaps.addTemplate(owner, testScenario.template, function (err, templateId, template) {
                assert.ok(!err, 'Unexpected error adding template: ' + (err && err.message));
                assert.ok(testScenario.template !== template, 'template instances should be different');
                assert.strictEqual(template.name, templateName);
                assert.deepStrictEqual(template.auth, testScenario.expected.auth);
                assert.deepStrictEqual(template.placeholders, testScenario.expected.placeholders);

                templateMaps.delTemplate(owner, templateName, done);
            });
        });
    });
});
