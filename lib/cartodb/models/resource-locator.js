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

ResourceLocator.prototype.getTileUrls = function(username, resourcePath) {
    if (this.resourcesUrlTemplates) {
        const urls = this.getUrlsFromTemplate(username, new TileResource(resourcePath));
        return {
            http: Array.isArray(urls.http) ? urls.http : [urls.http],
            https: Array.isArray(urls.https) ? urls.https : [urls.https]
        };
    }
    var cdnUrls = getCdnUrls(this.environment.serverMetadata, username, new TileResource(resourcePath));
    if (cdnUrls) {
        return cdnUrls;
    } else {
        var port = this.environment.port;
        return {
            http: [`http://${username}.localhost.lan:${port}/api/v1/map/${resourcePath}`]
        };
    }
};

ResourceLocator.prototype.getTemplateUrls = function(username, resourcePath) {
    if (this.resourcesUrlTemplates) {
        return this.getUrlsFromTemplate(username, new TemplateResource(resourcePath), true);
    }
    var cdnUrls = getCdnUrls(this.environment.serverMetadata, username, new TemplateResource(resourcePath));
    if (cdnUrls) {
        return cdnUrls;
    } else {
        var port = this.environment.port;
        return {
            http: {
                urlTemplate: `http://${username}.localhost.lan:${port}/api/v1/map/${resourcePath}`,
                subdomains: []
            }
        };
    }
};

ResourceLocator.prototype.getUrls = function(username, resourcePath) {
    if (this.resourcesUrlTemplates) {
        return this.getUrlsFromTemplate(username, new Resource(resourcePath));
    }
    var cdnUrls = getCdnUrls(this.environment.serverMetadata, username, new Resource(resourcePath));
    if (cdnUrls) {
        return cdnUrls;
    } else {
        var port = this.environment.port;
        return {
            http: `http://${username}.localhost.lan:${port}/api/v1/map/${resourcePath}`
        };
    }
};

function urlForTemplate(tpl, username, cdnDomain, resource, templated) {
    cdnDomain = cdnDomain || {};
    if (templated) {
        return {
            urlTemplate: tpl({
                cdn_url: (cdnDomain.hasOwnProperty('urlTemplate') ? cdnDomain.urlTemplate : cdnDomain),
                user: username,
                port: this.environment.port,
                resource: resource.getPath()
            }),
            subdomains: cdnDomain.subdomains || []
        };
    }
    if (Array.isArray(cdnDomain)) {
        return cdnDomain.map(d => tpl({
            cdn_url: d,
            user: username,
            port: this.environment.port,
            resource: resource.getPath()
        }));
    } else {
        return tpl({
            cdn_url: cdnDomain,
            user: username,
            port: this.environment.port,
            resource: resource.getPath()
        });
    }
}

ResourceLocator.prototype.getUrlsFromTemplate = function(username, resource, templated) {
    var urls = {};
    var cdnDomain = getCdnDomain(this.environment.serverMetadata, resource) || {};
    if (this.resourcesUrlTemplates.http) {
        urls.http = urlForTemplate(this.resourcesUrlTemplates.http, username, cdnDomain.http, resource, templated);
    }
    if (this.resourcesUrlTemplates.https) {
        urls.https = urlForTemplate(this.resourcesUrlTemplates.https, username, cdnDomain.https, resource, templated);
    }

    return urls;
};

class Resource {
    constructor (resourcePath) {
        this.resourcePath = resourcePath;
    }

    getPath () {
        return this.resourcePath;
    }

    getDomain (domain, subdomains) {
        if (!subdomains) {
            return domain;
        }
        return domain.replace('{s}', subdomain(subdomains, this.resourcePath));
    }

    getUrl (baseUrl, username, subdomains) {
        let urls = getUrl(baseUrl, username, this.resourcePath);
        if (subdomains) {
            urls = urls.replace('{s}', subdomain(subdomains, this.resourcePath));
        }
        return urls;
    }
}

class TileResource extends Resource {
    constructor (resourcePath) {
        super(resourcePath);
    }

    getDomain (domain, subdomains) {
        if (!subdomains) {
            return domain;
        }
        return subdomains.map(s => domain.replace('{s}', s));
    }

    getUrl (baseUrl, username, subdomains) {
        if (!subdomains) {
            return [super.getUrl(baseUrl, username)];
        }
        return subdomains.map(subdomain => {
            return getUrl(baseUrl, username, this.resourcePath)
                .replace('{s}', subdomain);
        });
    }
}

class TemplateResource extends Resource {
    constructor (resourcePath) {
        super(resourcePath);
    }

    getDomain (domain, subdomains) {
        return {
            urlTemplate: domain,
            subdomains: subdomains || []
        };
    }

    getUrl (baseUrl, username, subdomains) {
        return {
            urlTemplate: getUrl(baseUrl, username, this.resourcePath),
            subdomains: subdomains || []
        };
    }
}

function getUrl(baseUrl, username, path) {
    return `${baseUrl}/${username}/api/v1/map/${path}`;
}

function getCdnUrls(serverMetadata, username, resource) {
    if (serverMetadata && serverMetadata.cdn_url) {
        var cdnUrl = serverMetadata.cdn_url;
        var httpUrls = resource.getUrl(`http://${cdnUrl.http}`, username);
        var httpsUrls = resource.getUrl(`https://${cdnUrl.https}`, username);
        if (cdnUrl.templates) {
            var templates = cdnUrl.templates;
            httpUrls = resource.getUrl(templates.http.url, username, templates.http.subdomains);
            httpsUrls = resource.getUrl(templates.https.url, username, templates.https.subdomains);
        }
        return {
            http: httpUrls,
            https: httpsUrls,
        };
    }
    return null;
}

function getCdnDomain(serverMetadata, resource) {
    if (serverMetadata && serverMetadata.cdn_url) {
        var cdnUrl = serverMetadata.cdn_url;
        var httpDomain = resource.getDomain(cdnUrl.http);
        var httpsDomain = resource.getDomain(cdnUrl.https);
        if (cdnUrl.templates) {
            var templates = cdnUrl.templates;
            var httpUrlTemplate = templates.http.url;
            var httpsUrlTemplate = templates.https.url;
            httpDomain = httpUrlTemplate.replace(/^(http[s]*:\/\/)/, '');
            httpDomain = resource.getDomain(httpDomain, templates.http.subdomains);
            httpsDomain = httpsUrlTemplate.replace(/^(http[s]*:\/\/)/, '');
            httpsDomain = resource.getDomain(httpsDomain, templates.https.subdomains);
        }
        return {
            http: httpDomain,
            https: httpsDomain,
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
