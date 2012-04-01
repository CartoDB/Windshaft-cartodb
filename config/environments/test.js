module.exports.name             = 'test';
module.exports.postgres         = {user: 'tileuser', host: '127.0.0.1', port: 5432, simplify: true};
module.exports.redis            = {host: '127.0.0.1', 
                                   port: 6379, 
                                   idleTimeoutMillis: 1,
                                   reapIntervalMillis: 1};
module.exports.windshaft_port   = 8080;
module.exports.windshaft_host   = '127.0.0.1';
module.exports.enable_cors = true;
module.exports.varnish_host = '';
module.exports.varnish_port = null;
module.exports.cache_enabled = false;
