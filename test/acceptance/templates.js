var assert      = require('../support/assert');
var _           = require('underscore');
var redis       = require('redis');
var querystring = require('querystring');
var semver      = require('semver');
var mapnik      = require('mapnik');
var Step        = require('step');
var strftime    = require('strftime');
var SQLAPIEmu   = require(__dirname + '/../support/SQLAPIEmu.js');
var redis_stats_db = 5;

// Pollute the PG environment to make sure
// configuration settings are always enforced
// See https://github.com/CartoDB/Windshaft-cartodb/issues/174
process.env['PGPORT'] = '666';
process.env['PGHOST'] = 'fake';

var helper = require(__dirname + '/../support/test_helper');

var windshaft_fixtures = __dirname + '/../../node_modules/windshaft/test/fixtures';

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('template_api', function() {

    var redis_client = redis.createClient(global.environment.redis.port);
    var sqlapi_server;
    var expected_last_updated_epoch = 1234567890123; // this is hard-coded into SQLAPIEmu
    var expected_last_updated = new Date(expected_last_updated_epoch).toISOString();

    suiteSetup(function(done){
      sqlapi_server = new SQLAPIEmu(global.environment.sqlapi.port, done);
      // TODO: check redis is clean ?
    });

    var template_acceptance1 =  {
        version: '0.0.1',
        name: 'acceptance1',
        auth: { method: 'open' },
        layergroup:  {
          version: '1.0.0',
          layers: [
             { options: {
                 sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, -5e6, 0) as the_geom_webmercator from test_table limit 2 offset 2',
                 cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
                 cartocss_version: '2.0.2',
                 interactivity: 'cartodb_id'
               } }
          ]
        }
    };

    test("can add template, returning id", function(done) {

      var errors = [];
      var expected_failure = false;
      var expected_tpl_id = "localhost@acceptance1";
      var post_request_1 = {
          url: '/tiles/template',
          method: 'POST',
          headers: {host: 'localhost', 'Content-Type': 'application/json' },
          data: JSON.stringify(template_acceptance1)
      }
      Step(
        function postUnauthenticated()
        {
          var next = this;
          assert.response(server, post_request_1, {},
            function(res) { next(null, res); });
        },
        function postTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'), res.body);
          err = parsed.error;
          assert.ok(err.match(/only.*authenticated.*user/i),
            'Unexpected error response: ' + err);
          post_request_1.url += '?api_key=1234';
          var next = this;
          assert.response(server, post_request_1, {},
            function(res) { next(null, res); });
        },
        function rePostTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsedBody = JSON.parse(res.body);
          var expectedBody = { template_id: expected_tpl_id };
          assert.deepEqual(parsedBody, expectedBody);
          var next = this;
          assert.response(server, post_request_1, {},
            function(res) { next(null, res); });
        },
        function checkFailure(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 400, res.body);
          var parsedBody = JSON.parse(res.body);
          assert.ok(parsedBody.hasOwnProperty('error'), res.body);
          assert.ok(parsedBody.error.match(/already exists/i),
            'Unexpected error for pre-existing template name: ' + parsedBody.error);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length != 2 ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
              } else {
                if ( todrop.indexOf('map_tpl|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_tpl|localhost' key in redis"));
                }
                if ( todrop.indexOf('map_crt|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_crt|localhost' key in redis"));
                }
              }
              redis_client.del(todrop, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) {
                  done(new Error(errors));
                }
                else done(null);
              });
          });
        }
      );
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/128
    test("cannot create template with auth='token' and no valid tokens", function(done) {
      var tpl_id;
      Step(
        function postTemplate1()
        {
          // clone the valid one, and give it another name
          var broken_template = JSON.parse(JSON.stringify(template_acceptance1));
          broken_template.name = 'broken1';
          // Set auth='token' and specify no tokens
          broken_template.auth.method = 'token';
          delete broken_template.auth.tokens;
          var post_request_1 = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(broken_template)
          }
          var next = this;
          assert.response(server, post_request_1, {},
            function(res) { next(null, res); });
        },
        function checkFailure1(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 400, res.body);
          var parsedBody = JSON.parse(res.body);
          assert.ok(parsedBody.hasOwnProperty('error'), res.body);
          var re = RegExp(/invalid.*authentication.*missing/i);
          assert.ok(parsedBody.error.match(re),
            'Error for invalid authentication does not match ' + re + ': ' + parsedBody.error);
          return null;
        },
        function postTemplate2(err)
        {
          if ( err ) throw err;
          // clone the valid one and rename it
          var broken_template = JSON.parse(JSON.stringify(template_acceptance1));
          broken_template.name = 'broken1';
          // Set auth='token' and specify no tokens
          broken_template.auth.method = 'token';
          broken_template.auth.tokens = [];
          var post_request_1 = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(broken_template)
          }
          var next = this;
          assert.response(server, post_request_1, {},
            function(res) { next(null, res); });
        },
        function checkFailure2(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 400, res.body);
          var parsedBody = JSON.parse(res.body);
          assert.ok(parsedBody.hasOwnProperty('error'), res.body);
          var re = RegExp(/invalid.*authentication.*missing/i);
          assert.ok(parsedBody.error.match(re),
            'Error for invalid authentication does not match ' + re + ': ' + parsedBody.error);
          return null;
        },
        function postTemplateValid(err)
        {
          if ( err ) throw err;
          // clone the valid one and rename it
          var broken_template = JSON.parse(JSON.stringify(template_acceptance1));
          broken_template.name = 'broken1';
          var post_request_1 = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(broken_template)
          }
          var next = this;
          assert.response(server, post_request_1, {},
            function(res) { next(null, res); });
        },
        function putTemplateInvalid(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          // clone the valid one and rename it
          var broken_template = JSON.parse(JSON.stringify(template_acceptance1));
          broken_template.name = 'broken1';
          // Set auth='token' and specify no tokens
          broken_template.auth.method = 'token';
          broken_template.auth.tokens = [];
          var put_request_1 = {
              url: '/tiles/template/' + tpl_id + '/?api_key=1234',
              method: 'PUT',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(broken_template)
          }
          var next = this;
          assert.response(server, put_request_1, {},
            function(res) { next(null, res); });
        },
        function deleteTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 400, res.statusCode + ": " + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          var re = RegExp(/invalid.*authentication.*missing/i);
          assert.ok(parsed.error.match(re),
            'Error for invalid authentication on PUT does not match ' +
            re + ': ' + parsed.error);
          var del_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res, err) { next(err, res); });
        },
        function checkDelete(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 204, res.statusCode + ': ' + res.body);
          assert.ok(!res.body, 'Unexpected body in DELETE /template response');
          return null;
        },
        function finish(err) {
          var errors = [];
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length )
                errors.push(new Error("Unexpected keys in redis: " + todrop));
              if ( errors.length ) done(new Error(errors.join(',')));
              else done();
          });
        }
      );
    });

    test("instance endpoint should return CORS headers", function(done){
      Step(function postTemplate1(err, res) {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost.localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          };
          assert.response(server, post_request, {}, function(res) { next(null, res); });
        },
        function testCORS() {
          assert.response(server, {
              url: '/tiles/template/acceptance1',
              method: 'OPTIONS'
          },{
              status: 200,
              headers: {
                'Access-Control-Allow-Headers': 'X-Requested-With, X-Prototype-Version, X-CSRF-Token, Content-Type',
                'Access-Control-Allow-Origin': '*'
              }
          }, function() { done(); });
      });
    });


    test("can list templates", function(done) {

      var errors = [];
      var expected_failure = false;
      var tplid1, tplid2;
      Step(
        function postTemplate1(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function postTemplate2(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tplid1 = parsed.template_id;

          var next = this;
          var backup_name = template_acceptance1.name;
          template_acceptance1.name += '_new';
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          template_acceptance1.name = backup_name;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function litsTemplatesUnauthenticated(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tplid2 = parsed.template_id;
          var next = this;
          var get_request = {
              url: '/tiles/template',
              method: 'GET',
              headers: {host: 'localhost'}
          }
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function litsTemplates(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            'Missing error from response: ' + res.body);
          err = parsed.error;
          assert.ok(err.match(/authenticated user/), err);
          var next = this;
          var get_request = {
              url: '/tiles/template?api_key=1234',
              method: 'GET',
              headers: {host: 'localhost'}
          }
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkList(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_ids'),
            "Missing 'template_ids' from response body: " + res.body);
          var ids = parsed.template_ids;
          assert.equal(ids.length, 2);
          assert.ok(ids.indexOf(tplid1) != -1,
            'Missing "' + tplid1 + "' from list response: " + ids.join(','));
          assert.ok(ids.indexOf(tplid2) != -1,
            'Missing "' + tplid2 + "' from list response: " + ids.join(','));
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length != 2 ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
              } else {
                if ( todrop.indexOf('map_tpl|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_tpl|localhost' key in redis"));
                }
                if ( todrop.indexOf('map_crt|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_crt|localhost' key in redis"));
                }
              }
              redis_client.del(todrop, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) {
                  done(new Error(errors));
                }
                else done(null);
              });
          });
        }
      );
    });

    test("can update template", function(done) {

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function putMisnamedTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var backup_name = template_acceptance1.name;
          template_acceptance1.name = 'changed_name';
          var put_request = {
              url: '/tiles/template/' + tpl_id + '/?api_key=1234',
              method: 'PUT',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          template_acceptance1.name = backup_name;
          var next = this;
          assert.response(server, put_request, {},
            function(res) { next(null, res); });
        },
        function putUnexistentTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 400, res.statusCode + ": " + res.body);
          var parsedBody = JSON.parse(res.body);
          assert.ok(parsedBody.hasOwnProperty('error'), res.body);
          assert.ok(parsedBody.error.match(/cannot update name/i),
            'Unexpected error for invalid update: ' + parsedBody.error);
          var put_request = {
              url: '/tiles/template/unexistent/?api_key=1234',
              method: 'PUT',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          var next = this;
          assert.response(server, put_request, {},
            function(res) { next(null, res); });
        },
        function putValidTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 400, res.statusCode + ": " + res.body);
          var parsedBody = JSON.parse(res.body);
          assert.ok(parsedBody.hasOwnProperty('error'), res.body);
          assert.ok(parsedBody.error.match(/cannot update name/i),
            'Unexpected error for invalid update: ' + parsedBody.error);
          var put_request = {
              url: '/tiles/template/' + tpl_id + '/?api_key=1234',
              method: 'PUT',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          var next = this;
          assert.response(server, put_request, {},
            function(res) { next(null, res); });
        },
        function checkValidUpate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.statusCode + ": " + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          assert.equal(tpl_id, parsed.template_id);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length != 2 ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
              } else {
                if ( todrop.indexOf('map_tpl|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_tpl|localhost' key in redis"));
                }
                if ( todrop.indexOf('map_crt|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_crt|localhost' key in redis"));
                }
              }
              redis_client.del(todrop, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) {
                  done(new Error(errors));
                }
                else done(null);
              });
          });
        }
      );
    });

    test("can get a template by id", function(done) {

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function getTemplateUnauthorized(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var get_request = {
              url: '/tiles/template/' + tpl_id, 
              method: 'GET',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function getTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401, res.statusCode + ": " + res.body);
          var parsedBody = JSON.parse(res.body);
          assert.ok(parsedBody.hasOwnProperty('error'), res.body);
          assert.ok(parsedBody.error.match(/only.*authenticated.*user/i),
            'Unexpected error for unauthenticated template get: ' + parsedBody.error);
          var get_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'GET',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkReturnTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.statusCode + ": " + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template'),
            "Missing 'template' from response body: " + res.body);
          assert.deepEqual(template_acceptance1, parsed.template);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length != 2 ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
              } else {
                if ( todrop.indexOf('map_tpl|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_tpl|localhost' key in redis"));
                }
                if ( todrop.indexOf('map_crt|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_crt|localhost' key in redis"));
                }
              }
              redis_client.del(todrop, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) {
                  done(new Error(errors));
                }
                else done(null);
              });
          });
        }
      );
    });

    test("can delete a template by id", function(done) {

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance1)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function getTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var get_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'GET',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function deleteTemplateUnauthorized(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.statusCode + ": " + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template'),
            "Missing 'template' from response body: " + res.body);
          assert.deepEqual(template_acceptance1, parsed.template);
          var del_request = {
              url: '/tiles/template/' + tpl_id,
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res) { next(null, res); });
        },
        function deleteTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401, res.statusCode + ": " + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/only.*authenticated.*user/i),
            'Unexpected error for unauthenticated template get: ' + parsed.error);
          var del_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res) { next(null, res); });
        },
        function getMissingTemplate(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 204, res.statusCode + ': ' + res.body);
          assert.ok(!res.body, 'Unexpected body in DELETE /template response');
          var get_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'GET',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkGetFailure(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 404, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/cannot find/i),
            'Unexpected error for missing template: ' + parsed.error);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
                redis_client.del(todrop, function(err) {
                  if ( err ) errors.push(err.message);
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
                });
              } else {
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
              }
          });
        }
      );
    });

    test("can instanciate a template by id", function(done) {

      // This map fetches data from a private table
      var template_acceptance2 =  {
          version: '0.0.1',
          name: 'acceptance1',
          auth: { method: 'token', valid_tokens: ['valid1','valid2'] },
          layergroup:  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: "select * from test_table_private_1 LIMIT 0",
                   cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
                   cartocss_version: '2.0.2',
                   interactivity: 'cartodb_id'
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance2)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateNoAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        // See https://github.com/CartoDB/Windshaft-cartodb/issues/173
        function instanciateForeignDB(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401,
            'Unexpected success instanciating template with no auth: '
            + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/unauthorized/i),
            'Unexpected error for unauthorized instance : ' + parsed.error);
          var post_request = {
              url: '/tiles/template/' + tpl_id + '?auth_token=valid2',
              method: 'POST',
              headers: {host: 'foreign', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 403, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/cannot instanciate/i),
            'Unexpected error for forbidden instance : ' + parsed.error);
          var post_request = {
              url: '/tiles/template/' + tpl_id + '?auth_token=valid2',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function fetchTileNoAuth(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Instantiating template: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('layergroupid'),
            "Missing 'layergroupid' from response body: " + res.body);
          layergroupid = parsed.layergroupid;
          assert.ok(layergroupid.match(/^localhost@/),
            "Returned layergroupid does not start with signer name: "
            + layergroupid);
          assert.ok(parsed.hasOwnProperty('last_updated'),
            "Missing 'last_updated' from response body: " + res.body);
          // TODO: check value of last_updated ?
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb0/0/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function fetchTileAuth(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401,
            'Fetching tile with no auth: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/permission denied/i),
            'Unexpected error for unauthorized instance '
            + '(expected /permission denied/): ' + parsed.error);
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + '/0/0/0.png?auth_token=valid1',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkTile(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, 
            'Unexpected error for authorized instance: '
            + res.statusCode + ' -- ' + res.body);
          assert.equal(res.headers['content-type'], "image/png");
          return null;
        },
        // See https://github.com/CartoDB/Windshaft-cartodb/issues/172
        function fetchTileForeignSignature(err, res) {
          if ( err ) throw err;
          var foreignsigned = layergroupid.replace(/[^@]*@/, 'foreign@');
          var get_request = {
              url: '/tiles/layergroup/' + foreignsigned + '/0/0/0.png?auth_token=valid1',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkForeignSignerError(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 403, 
            'Unexpected error for authorized instance: '
            + res.statusCode + ' -- ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/cannot use/i),
            'Unexpected error for unauthorized instance '
            + '(expected /cannot use/): ' + parsed.error);
          return null;
        },
        function deleteTemplate(err)
        {
          if ( err ) throw err;
          var del_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res) { next(null, res); });
        },
        function fetchTileDeleted(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 204,
            'Deleting template: ' + res.statusCode + ':' + res.body);
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + '/0/0/0.png?auth_token=valid1',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkTileDeleted(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401, 
            'Unexpected statusCode fetch tile after signature revokal: '
            + res.statusCode + ':' + res.body); 
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/permission denied/i),
            'Unexpected error for unauthorized access : ' + parsed.error);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
                redis_client.del(todrop, function(err) {
                  if ( err ) errors.push(err.message);
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
                });
              } else {
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
              }
          });
        }
      );
    });

    test("can instanciate a template with torque layer by id", function(done) {

      // This map fetches data from a private table
      var template =  {
          version: '0.0.1',
          name: 'acceptance1',
          auth: { method: 'token', valid_tokens: ['valid1','valid2'] },
          layergroup:  {
            version: '1.1.0',
            layers: [
               { type: 'torque', options: {
                   sql: "select * from test_table_private_1 LIMIT 0",
                   cartocss: "Map { -torque-frame-count:1; -torque-resolution:1; -torque-aggregation-function:'count(*)'; -torque-time-attribute:'updated_at'; }"
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateNoAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401,
            'Unexpected success instanciating template with no auth: '
            + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/unauthorized/i),
            'Unexpected error for unauthorized instance : ' + parsed.error);
          var post_request = {
              url: '/tiles/template/' + tpl_id + '?auth_token=valid2',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function fetchTileNoAuth(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Instantiating template: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('layergroupid'),
            "Missing 'layergroupid' from response body: " + res.body);
          layergroupid = parsed.layergroupid;
          assert.ok(layergroupid.match(/^localhost@/),
            "Returned layergroupid does not start with signer name: "
            + layergroupid);
          assert.ok(parsed.hasOwnProperty('last_updated'),
            "Missing 'last_updated' from response body: " + res.body);
          // TODO: check value of last_updated ?
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb0/0/0/0/0.json.torque',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function fetchTileAuth(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401,
            'Fetching tile with no auth: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/permission denied/i),
            'Unexpected error for unauthorized instance '
            + '(expected /permission denied): ' + parsed.error);
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb1/0/0/0/0.json.torque?auth_token=valid1',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkTile(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, 
            'Unexpected error for authorized instance: '
            + res.statusCode + ' -- ' + res.body);
          assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
          return null;
        },
        function deleteTemplate(err)
        {
          if ( err ) throw err;
          var del_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res) { next(null, res); });
        },
        function fetchTileDeleted(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 204,
            'Deleting template: ' + res.statusCode + ':' + res.body);
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb2/0/0/0/0.json.torque?auth_token=valid1',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkTileDeleted(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401, 
            'Unexpected statusCode fetch tile after signature revokal: '
            + res.statusCode + ':' + res.body); 
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/permission denied/i),
            'Unexpected error for unauthorized access : ' + parsed.error);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
                redis_client.del(todrop, function(err) {
                  if ( err ) errors.push(err.message);
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
                });
              } else {
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
              }
          });
        }
      );
    });

    test("can instanciate a template with attribute service by id", function(done) {

      // This map fetches data from a private table
      var template =  {
          version: '0.0.1',
          name: 'acceptance1',
          auth: { method: 'token', valid_tokens: ['valid1','valid2'] },
          layergroup:  {
            version: '1.1.0',
            layers: [
               { options: {
                   sql: "select * from test_table_private_1 where cartodb_id in ( 5,6 )",
                   cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
                   cartocss_version: '2.0.2',
                   attributes: { id:'cartodb_id', columns: ['name', 'address'] }
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateNoAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401,
            'Unexpected success instanciating template with no auth: '
            + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/unauthorized/i),
            'Unexpected error for unauthorized instance : ' + parsed.error);
          var post_request = {
              url: '/tiles/template/' + tpl_id + '?auth_token=valid2',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res, err) { next(null, res); });
        },
        function fetchAttributeNoAuth(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Instantiating template: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('layergroupid'),
            "Missing 'layergroupid' from response body: " + res.body);
          layergroupid = parsed.layergroupid;
          assert.ok(layergroupid.match(/^localhost@/),
            "Returned layergroupid does not start with signer name: "
            + layergroupid);
          assert.ok(parsed.hasOwnProperty('last_updated'),
            "Missing 'last_updated' from response body: " + res.body);
          // TODO: check value of last_updated ?
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb0/0/attributes/5',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function fetchAttributeAuth(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401,
            'Fetching tile with no auth: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/permission denied/i),
            'Unexpected error for unauthorized getAttributes '
            + '(expected /permission denied/): ' + parsed.error);
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb1/0/attributes/5?auth_token=valid2',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkAttribute(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, 
            'Unexpected error for authorized getAttributes: '
            + res.statusCode + ' -- ' + res.body);
          assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
          return null;
        },
        function deleteTemplate(err)
        {
          if ( err ) throw err;
          var del_request = {
              url: '/tiles/template/' + tpl_id + '?api_key=1234', 
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res) { next(null, res); });
        },
        function fetchAttrDeleted(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 204,
            'Deleting template: ' + res.statusCode + ':' + res.body);
          var get_request = {
              url: '/tiles/layergroup/' + layergroupid + ':cb2/0/attributes/5?auth_token=valid2',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }
          var next = this;
          assert.response(server, get_request, {},
            function(res) { next(null, res); });
        },
        function checkTileDeleted(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 401, 
            'Unexpected statusCode fetch tile after signature revokal: '
            + res.statusCode + ':' + res.body); 
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('error'),
            "Missing 'error' from response body: " + res.body);
          assert.ok(parsed.error.match(/permission denied/i),
            'Unexpected error for unauthorized access : ' + parsed.error);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
                redis_client.del(todrop, function(err) {
                  if ( err ) errors.push(err.message);
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
                });
              } else {
                  if ( errors.length ) {
                    done(new Error(errors));
                  }
                  else done(null);
              }
          });
        }
      );
    });

    test("can instanciate a template by id with open auth", function(done) {

      // This map fetches data from a private table
      var template_acceptance_open =  {
          version: '0.0.1',
          name: 'acceptance_open',
          auth: { method: 'open' },
          layergroup:  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: "select * from test_table_private_1 LIMIT 0",
                   cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
                   cartocss_version: '2.0.2',
                   interactivity: 'cartodb_id'
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance_open)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateNoAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          helper.checkNoCache(res);
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Unexpected success instanciating template with no auth: '
            + res.statusCode + ': ' + res.body);
          done();
        }
      );
    });

    test("can instanciate a template using jsonp", function(done) {

      // This map fetches data from a private table
      var template_acceptance_open =  {
          version: '0.0.1',
          name: 'acceptance_open_jsonp',
          auth: { method: 'open' },
          layergroup:  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: "select * from test_table_private_1 LIMIT 0",
                   cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
                   cartocss_version: '2.0.2',
                   interactivity: 'cartodb_id'
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance_open)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateNoAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id + "/jsonp?callback=test",
              method: 'GET',
              headers: {host: 'localhost' }
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function checkInstanciation(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          // See https://github.com/CartoDB/Windshaft-cartodb/issues/176
          helper.checkNoCache(res);
          return null;
        },
        function finish(err) {
          done(err);
        }
      );
    });

    test("can instanciate a template using jsonp with params", function(done) {

      // This map fetches data from a private table
      var template_acceptance_open =  {
          version: '0.0.1',
          name: 'acceptance_open_jsonp_params',
          auth: { method: 'open' },
          /*
          placeholders: {
            color: { type: "css_color", default: "red" }
          },*/
          layergroup:  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: "select * from test_table_private_1 LIMIT 0",
                   cartocss: '#layer { marker-fill: <%= color %>; marker-allow-overlap:true; }', 
                   cartocss_version: '2.0.2',
                   interactivity: 'cartodb_id'
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance_open)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instanciateNoAuth(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id + "/jsonp?callback=test%config=" + JSON.stringify('{color:blue}'),
              method: 'GET',
              headers: {host: 'localhost' }
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function checkInstanciation(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          // See https://github.com/CartoDB/Windshaft-cartodb/issues/176
          helper.checkNoCache(res);
          return null;
        },
        function finish(err) {
          done(err);
        }
      );
    });

    test("template instantiation raises mapviews counter", function(done) {
      var layergroup =  {
        stat_tag: 'random_tag',
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, !pixel_height! as h, '
                  + 'ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!)) as the_geom_webmercator',
               cartocss: '#layer { polygon-fill:red; }', 
               cartocss_version: '2.0.1' 
             } }
        ]
      };
      var template =  {
          version: '0.0.1',
          name: 'stat_gathering',
          auth: { method: 'open' },
          layergroup: layergroup
      };
      var statskey = "user:localhost:mapviews";
      var redis_stats_client = redis.createClient(global.environment.redis.port);
      var template_id; // will be set on template post 
      var now = strftime("%Y%m%d", new Date());
      var errors = [];
      Step(
        function clean_stats()
        {
          var next = this;
          redis_stats_client.select(redis_stats_db, function(err) {
            if ( err ) next(err);
            else redis_stats_client.del(statskey+':global', next);
          });
        },
        function do_post_tempate(err)
        {
          if ( err ) throw err;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instantiateTemplate(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          template_id = JSON.parse(res.body).template_id;
          var post_request = {
              url: '/tiles/template/' + template_id,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify({})
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function check_global_stats(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Instantiating template: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('layergroupid'),
            "Missing 'layergroupid' from response body: " + res.body);
          layergroupid = parsed.layergroupid;
          redis_stats_client.zscore(statskey + ":global", now, this);
        },
        function check_tag_stats(err, val) {
          if ( err ) throw err;
          assert.equal(val, 1, "Expected score of " + now + " in "
              +  statskey + ":global to be 1, got " + val);
          redis_stats_client.zscore(statskey+':stat_tag:random_tag', now, this);
        },
        function check_tag_stats_value(err, val) {
          if ( err ) throw err;
          assert.equal(val, 1, "Expected score of " + now + " in "
              +  statskey + ":stat_tag:" + layergroup.stat_tag + " to be 1, got " + val);
          return null;
        },
        function deleteTemplate(err)
        {
          if ( err ) throw err;
          var del_request = {
              url: '/tiles/template/' + template_id + '?api_key=1234', 
              method: 'DELETE',
              headers: {host: 'localhost'}
          }
          var next = this;
          assert.response(server, del_request, {},
            function(res) { next(null, res); });
        },
        function cleanup_stats(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 204, res.statusCode + ': ' + res.body);
          if ( err ) errors.push('' + err);
          redis_client.del([statskey+':global', statskey+':stat_tag:'+layergroup.stat_tag], this);
        },
        function finish(err) {
          if ( err ) errors.push('' + err);
          if ( errors.length ) done(new Error(errors.join(',')));
          else done(null);
        }
      );
    });

    test("instance map token changes with templates certificate changes", function(done) {

      // This map fetches data from a private table
      var template_acceptance2 =  {
          version: '0.0.1',
          name: 'acceptance2',
          auth: { method: 'token', valid_tokens: ['valid1','valid2'] },
          layergroup:  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: "select * from test_table_private_1 LIMIT 0",
                   cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
                   cartocss_version: '2.0.2',
                   interactivity: 'cartodb_id'
                 } }
            ]
          }
      };

      var template_params = {};

      var errors = [];
      var expected_failure = false;
      var tpl_id;
      var layergroupid;
      Step(
        function postTemplate(err, res)
        {
          var next = this;
          var post_request = {
              url: '/tiles/template?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_acceptance2)
          }
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instance1(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          tpl_id = parsed.template_id;
          var post_request = {
              url: '/tiles/template/' + tpl_id + '?auth_token=valid2',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res, err) { next(err, res); });
        },
        function checkInstance1(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Instantiating template: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('layergroupid'),
            "Missing 'layergroupid' from response body: " + res.body);
          layergroupid = parsed.layergroupid;
          return null;
        },
        function updateTemplate(err, res)
        {
          if ( err ) throw err;
          // clone the valid one and rename it
          var changedTemplate = JSON.parse(JSON.stringify(template_acceptance2));
          changedTemplate.auth.method = 'open';
          var post_request = {
              url: '/tiles/template/' + tpl_id + '/?api_key=1234',
              method: 'PUT',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(changedTemplate)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res) { next(null, res); });
        },
        function instance2(err, res)
        {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('template_id'),
            "Missing 'template_id' from response body: " + res.body);
          assert.equal(tpl_id, parsed.template_id);
          var post_request = {
              url: '/tiles/template/' + tpl_id + '?auth_token=valid2',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template_params)
          }
          var next = this;
          assert.response(server, post_request, {},
            function(res, err) { next(err, res); });
        },
        function checkInstance2(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200,
            'Instantiating template: ' + res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('layergroupid'),
            "Missing 'layergroupid' from response body: " + res.body);
          assert.ok(layergroupid != parsed.layergroupid);
          return null;
        },
        function finish(err) {
          if ( err ) errors.push(err);
          redis_client.keys("map_*|localhost", function(err, keys) {
              if ( err ) errors.push(err.message);
              var todrop = _.map(keys, function(m) {
                if ( m.match(/^map_(tpl|crt)|/) )
                  return m;
              });
              if ( todrop.length != 2 ) {
                errors.push(new Error("Unexpected keys in redis: " + todrop));
              } else {
                if ( todrop.indexOf('map_tpl|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_tpl|localhost' key in redis"));
                }
                if ( todrop.indexOf('map_crt|localhost') == -1 ) {
                  errors.push(new Error("Missing 'map_crt|localhost' key in redis"));
                }
              }
              redis_client.del(todrop, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) {
                  done(new Error(errors));
                }
                else done(null);
              });
          });
        }
      );
    });

    suiteTeardown(function(done) {

        // This test will add map_style records, like
        // 'map_style|null|publicuser|my_table',
        redis_client.keys("map_*", function(err, keys) {
            var todrop = _.map(keys, function(m) {
              if ( m.match(/^map_(tpl|crt|sig)|/) ) return m;
            });
            redis_client.del(todrop, function(err) {
              redis_client.select(5, function(err) {
                redis_client.keys("user:localhost:mapviews*", function(err, keys) {
                  redis_client.del(keys, function(err) {
                    sqlapi_server.close(done);
                  });
                });
              });
            });
        });

    });
    
});

