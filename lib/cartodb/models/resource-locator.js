var crypto = require('crypto');

var dot = require('dot');
dot.templateSettings.strip = false;

function ResourceLocator(environment) {
    this.environment = environment;

    this.resourcesUrlTemplates = null;
    if (this.environment.resources_url_templates) {
        var templates = environment.resources_url_templates;

        if (templates.http) {
            this.resourcesUrlTemplates = this.resourcesUrlTemplates || {};
            this.resourcesUrlTemplates.http = dot.template(templates.http + '/{{=it.resource}}');
        }
        if (templates.https) {
            this.resourcesUrlTemplates = this.resourcesUrlTemplates || {};
            this.resourcesUrlTemplates.https = dot.template(templates.https + '/{{=it.resource}}');
        }
    }
}

module.exports = ResourceLocator;

ResourceLocator.prototype.getUrls = function(username, resource) {
    if (this.resourcesUrlTemplates) {
        return this.getUrlsFromTemplate(username, resource);
    }
    var cdnDomain = getCdnDomain(this.environment.serverMetadata, resource);
    if (cdnDomain) {
        return {
            http: 'http://' + cdnDomain.http + '/' + username + '/api/v1/map/' + resource,
            https: 'https://' + cdnDomain.https + '/' + username + '/api/v1/map/' + resource
        };
    } else {
        var port = this.environment.port;
        return {
            http: 'http://' + username + '.' + 'localhost.lan:' + port +  '/api/v1/map/' + resource
        };
    }
};


ResourceLocator.prototype.getUrlsFromTemplate = function(username, resource) {
    var urls = {};
    var cdnDomain = getCdnDomain(this.environment.serverMetadata, resource) || {};

    if (this.resourcesUrlTemplates.http) {
        urls.http = this.resourcesUrlTemplates.http({
            cdn_url: cdnDomain.http,
            user: username,
            port: this.environment.port,
            resource: resource
        });
    }

    if (this.resourcesUrlTemplates.https) {
        urls.https = this.resourcesUrlTemplates.https({
            cdn_url: cdnDomain.https,
            user: username,
            port: this.environment.port,
            resource: resource
        });
    }

    return urls;
};

function getCdnDomain(serverMetadata, resource) {
    if (serverMetadata && serverMetadata.cdn_url) {
        var cdnUrl = serverMetadata.cdn_url;
        var http = cdnUrl.http;
        var https = cdnUrl.https;
        if (cdnUrl.templates) {
            var templates = cdnUrl.templates;
            var httpUrlTemplate = templates.http.url;
            var httpsUrlTemplate = templates.https.url;
            http = httpUrlTemplate
                .replace(/^(http[s]*:\/\/)/, '')
                .replace('{s}', subdomain(templates.http.subdomains, resource));
            https = httpsUrlTemplate
                .replace(/^(http[s]*:\/\/)/, '')
                .replace('{s}', subdomain(templates.https.subdomains, resource));
        }
        return {
            http: http,
            https: https,
        };
    }
    return null;
}

function subdomain(subdomains, resource) {
    var resourceHash = crypto.createHash('md5').update(resource, 'binary').digest('hex');
    var index = parseInt(resourceHash, 16) % subdomains.length;
    return subdomains[index];
}
module.exports.subdomain = subdomain;