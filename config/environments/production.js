module.exports.name             = 'production';
module.exports.postgres         = {user: 'tileuser', host: '127.0.0.1', port: 6432, max_size: 4};
module.exports.redis            = {host: '127.0.0.1', port: 6379};
module.exports.windshaft_port   = 8181;
module.exports.ttl_timeout = 600; // 10 minutes
module.exports.varnish_host = 'localhost';
module.exports.varnish_port = 6082
module.exports.cache_enabled = true; 
