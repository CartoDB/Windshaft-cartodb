require('../../support/test_helper');

var assert = require('assert');
var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../../lib/cartodb/template_maps.js');
var _ = require('underscore');

describe('template_maps', function() {

    var redisPool = new RedisPool(global.environment.redis),
        templateMaps = new TemplateMaps(redisPool);

    var owner = 'me';
    var templateName = 'wadus';


    var defaultTemplate = {
        version:'0.0.1',
        name: templateName
    };

    function makeTemplate(layers) {
        var layergroup = {
            layers: layers
        };
        return _.extend({}, defaultTemplate, {
            layergroup: layergroup
        });
    }

    var layerWithMissingOptions = {},
        minimumValidLayer = {
            options: {
                sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
                cartocss: '#layer { marker-fill:blue; }',
                cartocss_version: '2.3.0'
            }
        };

    var testScenarios = [
        {
            desc: 'Missing layers array does not validate',
            template: makeTemplate(),
            expected: {
                isValid: false,
                message: 'Missing or empty layers array from layergroup config'
            }
        },
        {
            desc: 'Empty layers array does not validate',
            template: makeTemplate([]),
            expected: {
                isValid: false,
                message: 'Missing or empty layers array from layergroup config'
            }
        },
        {
            desc: 'Layer with missing options does not validate',
            template: makeTemplate([
                layerWithMissingOptions
            ]),
            expected: {
                isValid: false,
                message: 'Missing `options` in layergroup config for layers: 0'
            }
        },
        {
            desc: 'Multiple layers report invalid layer',
            template: makeTemplate([
                minimumValidLayer,
                layerWithMissingOptions
            ]),
            expected: {
                isValid: false,
                message: 'Missing `options` in layergroup config for layers: 1'
            }
        },
        {
            desc: 'default auth but specified placeholders',
            template: makeTemplate([
                minimumValidLayer
            ]),
            expected: {
                isValid: true,
                message: ''
            }
        }
    ];

    testScenarios.forEach(function(testScenario) {
        it(testScenario.desc, function(done) {

            templateMaps.addTemplate(owner, testScenario.template, function(err) {

                if (testScenario.expected.isValid) {

                    assert.ok(!err);
                    templateMaps.delTemplate(owner, templateName, done);

                } else {

                    assert.ok(err);
                    assert.equal(err.message, testScenario.expected.message);
                    done();

                }

            });

        });
    });

});
