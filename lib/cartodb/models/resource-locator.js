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

// ref https://jsperf.com/js-crc32
function crcTable() {
    var c;
    var table = [];
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      table[n] = c;
    }
    return table;
}
var CRC_TABLE = crcTable();

function crc32(str) {
    var crc = 0 ^ (-1);
    for (var i = 0; i < str.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

function subdomain(subdomains, resource) {
    var index = crc32(resource) % subdomains.length;
    return subdomains[index];
}
module.exports.subdomain = subdomain;
