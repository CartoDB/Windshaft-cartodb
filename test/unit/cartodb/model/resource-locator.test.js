require('../../../support/test_helper');

var assert = require('../../../support/assert');
var ResourceLocator = require('../../../../lib/cartodb/models/resource-locator');

describe('ResourceLocator', function() {
    var USERNAME = 'username';
    var RESOURCE = 'wadus';
    var TILE_RESOURCE = 'wadus/{z}/{x}/{y}.png';
    var HTTP_SUBDOMAINS = ['1', '2', '3', '4'];
    var HTTPS_SUBDOMAINS = ['a', 'b', 'c', 'd'];

    it('should return default urls when no serverMetadata is in environment', function() {
        var resourceLocator = new ResourceLocator({});
        var urls = resourceLocator.getUrls(USERNAME, RESOURCE);
        assert.ok(urls);
    });

    describe('basic', function() {

        var BASIC_ENVIRONMENT = {
            serverMetadata: {
                cdn_url: {
                    http: 'cdn.carto.com',
                    https: 'cdn.ssl.carto.com'
                }
            }
        };

        describe('getUrls', function() {
            it('should return default urls when basic http and https domains are provided', function() {
                var resourceLocator = new ResourceLocator(BASIC_ENVIRONMENT);
                var urls = resourceLocator.getUrls(USERNAME, RESOURCE);
                assert.ok(urls);

                assert.equal(urls.http, ['http://cdn.carto.com', USERNAME, 'api/v1/map', RESOURCE].join('/'));
                assert.equal(urls.https, ['https://cdn.ssl.carto.com', USERNAME, 'api/v1/map', RESOURCE].join('/'));
            });
        });

        describe('getTileUrls', function() {
            it('should return default urls when basic http and https domains are provided', function() {
                var resourceLocator = new ResourceLocator(BASIC_ENVIRONMENT);
                var urls = resourceLocator.getTileUrls(USERNAME, TILE_RESOURCE);
                assert.ok(urls);

                assert.deepEqual(
                    urls.http,
                    [`http://cdn.carto.com/${USERNAME}/api/v1/map/${TILE_RESOURCE}`]
                );
                assert.deepEqual(
                    urls.https,
                    [`https://cdn.ssl.carto.com/${USERNAME}/api/v1/map/${TILE_RESOURCE}`]
                );
            });
        });
    });

    describe('resource templates', function() {

        var RESOURCE_TEMPLATES_ENVIRONMENT = {
            serverMetadata: {
                cdn_url: {
                    http: 'cdn.carto.com',
                    https: 'cdn.ssl.carto.com'
                }
            },
            resources_url_templates: {
                http: 'http://{{=it.user}}.localhost.lan/api/v1/map',
                https: 'https://{{=it.user}}.ssl.localhost.lan/api/v1/map'
            }
        };

        describe('getUrls', function() {
            it('resources_url_templates should take precedence over http and https domains', function() {
                var resourceLocator = new ResourceLocator(RESOURCE_TEMPLATES_ENVIRONMENT);
                var urls = resourceLocator.getUrls(USERNAME, RESOURCE);
                assert.ok(urls);

                assert.equal(
                    urls.http,
                    ['http://' + USERNAME + '.localhost.lan', 'api/v1/map', RESOURCE].join('/')
                );
                assert.equal(
                    urls.https,
                    ['https://' + USERNAME + '.ssl.localhost.lan', 'api/v1/map', RESOURCE].join('/')
                );
            });
        });

        describe('getTileUrls', function() {
            it('resources_url_templates should take precedence over http and https domains', function() {
                var resourceLocator = new ResourceLocator(RESOURCE_TEMPLATES_ENVIRONMENT);
                var urls = resourceLocator.getTileUrls(USERNAME, TILE_RESOURCE);
                assert.ok(urls);

                assert.deepEqual(
                    urls.http,
                    [`http://${USERNAME}.localhost.lan/api/v1/map/${TILE_RESOURCE}`]
                );
                assert.deepEqual(
                    urls.https,
                    [`https://${USERNAME}.ssl.localhost.lan/api/v1/map/${TILE_RESOURCE}`]
                );
            });
        });
    });

    describe('cdn templates', function() {

        var CDN_TEMPLATES_ENVIRONMENT = {
            serverMetadata: {
                cdn_url: {
                    http: 'cdn.carto.com',
                    https: 'cdn.ssl.carto.com',
                    templates: {
                        http: {
                            url: "http://{s}.cdn.carto.com",
                            subdomains: HTTP_SUBDOMAINS
                        },
                        https: {
                            url: "https://cdn_{s}.ssl.cdn.carto.com",
                            subdomains: HTTPS_SUBDOMAINS
                        }
                    }
                }
            }
        };
        describe('getUrls', function() {
            it('cdn_url templates should take precedence over http and https domains', function() {
                var resourceLocator = new ResourceLocator(CDN_TEMPLATES_ENVIRONMENT);
                var urls = resourceLocator.getUrls(USERNAME, RESOURCE);
                assert.ok(urls);

                var httpSubdomain = ResourceLocator.subdomain(HTTP_SUBDOMAINS, RESOURCE);
                var httpsSubdomain = ResourceLocator.subdomain(HTTPS_SUBDOMAINS, RESOURCE);

                assert.equal(
                    urls.http,
                    ['http://' + httpSubdomain + '.cdn.carto.com', USERNAME, 'api/v1/map', RESOURCE].join('/')
                );
                assert.equal(
                    urls.https,
                    ['https://cdn_' + httpsSubdomain + '.ssl.cdn.carto.com', USERNAME, 'api/v1/map', RESOURCE].join('/')
                );
            });
        });

        describe('getTileUrls', function() {
            it('cdn_url templates should take precedence over http and https domains', function() {
                var resourceLocator = new ResourceLocator(CDN_TEMPLATES_ENVIRONMENT);
                var urls = resourceLocator.getTileUrls(USERNAME, TILE_RESOURCE);
                assert.ok(urls);

                assert.deepEqual(
                    urls.http,
                    HTTP_SUBDOMAINS
                        .map(s => `http://${s}.cdn.carto.com/${USERNAME}/api/v1/map/${TILE_RESOURCE}`)
                );
                assert.deepEqual(
                    urls.https,
                    HTTPS_SUBDOMAINS
                        .map(s => `https://cdn_${s}.ssl.cdn.carto.com/${USERNAME}/api/v1/map/${TILE_RESOURCE}`)
                );
            });
        });

    });

    describe('cdn and resource templates', function() {

        var CDN_URL_AND_RESOURCE_TEMPLATES_ENVIRONMENT = {
            serverMetadata: {
                cdn_url: {
                    http: 'cdn.carto.com',
                    https: 'cdn.ssl.carto.com',
                    templates: {
                        http: {
                            url: "http://{s}.cdn.carto.com",
                            subdomains: HTTP_SUBDOMAINS
                        },
                        https: {
                            url: "https://cdn_{s}.ssl.cdn.carto.com",
                            subdomains: HTTPS_SUBDOMAINS
                        }
                    }
                }
            },
            resources_url_templates: {
                http: 'http://{{=it.cdn_url}}/u/{{=it.user}}/api/v1/map',
                https: 'https://{{=it.cdn_url}}/u/{{=it.user}}/api/v1/map'
            }
        };

        describe('getUrls', function() {
            it('should mix cdn_url templates and resources_url_templates', function() {
                var resourceLocator = new ResourceLocator(CDN_URL_AND_RESOURCE_TEMPLATES_ENVIRONMENT);
                var urls = resourceLocator.getUrls(USERNAME, RESOURCE);
                assert.ok(urls);

                var httpSubdomain = ResourceLocator.subdomain(HTTP_SUBDOMAINS, RESOURCE);
                var httpsSubdomain = ResourceLocator.subdomain(HTTPS_SUBDOMAINS, RESOURCE);

                assert.equal(
                    urls.http,
                    ['http://' + httpSubdomain + '.cdn.carto.com', 'u', USERNAME, 'api/v1/map', RESOURCE].join('/')
                );
                assert.equal(
                    urls.https,
                    `https://cdn_${httpsSubdomain}.ssl.cdn.carto.com/u/${USERNAME}/api/v1/map/${RESOURCE}`
                );
            });
        });

        describe('getTileUrls', function() {
            it('should mix cdn_url templates and resources_url_templates', function() {
                var resourceLocator = new ResourceLocator(CDN_URL_AND_RESOURCE_TEMPLATES_ENVIRONMENT);
                var urls = resourceLocator.getTileUrls(USERNAME, TILE_RESOURCE);
                assert.ok(urls);

                assert.deepEqual(
                    urls.http,
                    HTTP_SUBDOMAINS
                        .map(s => `http://${s}.cdn.carto.com/u/${USERNAME}/api/v1/map/${TILE_RESOURCE}`)
                );
                assert.deepEqual(
                    urls.https,
                    HTTPS_SUBDOMAINS
                        .map(s => `https://cdn_${s}.ssl.cdn.carto.com/u/${USERNAME}/api/v1/map/${TILE_RESOURCE}`)
                );
            });
        });

    });

});
