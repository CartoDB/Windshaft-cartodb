module.exports.name             = 'development';
module.exports.postgres         = {user: 'tileuser', host: '127.0.0.1', port: 5432};
module.exports.redis            = {host: '127.0.0.1', 
                                   port: 6379, 
                                   idleTimeoutMillis: 1,
                                   reapIntervalMillis: 1};
module.exports.windshaft_port   = 8181;
module.exports.enable_cors = true;
module.exports.varnish_host = 'localhost';
module.exports.varnish_port = 6082;
module.exports.cache_enabled = true;
